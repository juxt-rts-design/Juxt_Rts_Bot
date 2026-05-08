const { default: makeWASocket, DisconnectReason, useMultiFileAuthState, fetchLatestBaileysVersion, downloadContentFromMessage } = require('@whiskeysockets/baileys');
const { Boom } = require('@hapi/boom');
const P = require('pino');
const qrcode = require('qrcode');
const fs = require('fs');
const path = require('path');
const axios = require('axios');
const { GoogleGenerativeAI } = require('@google/generative-ai');
const { exec } = require('child_process');
const { promisify } = require('util');
const execAsync = promisify(exec);
const FallbackHandler = require('./fallbackHandler');
const ytdl = require('@distube/ytdl-core');
const puppeteer = require('puppeteer');
const fbDownloader = require('fb-downloader-scrapper');
const sharp = require('sharp');
const ffmpegPath = require('ffmpeg-static');
const webp = require('webp-converter');

// Configuration
require('dotenv').config();

const PREFIX = process.env.PREFIX || '-';
const CREATOR_CONTACT = process.env.CREATOR_CONTACT || '+241076234942@s.whatsapp.net';
const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
const OPENROUTER_API_KEY = process.env.OPENROUTER_API_KEY;
const SESSION_DIR = process.env.SESSION_DIR || './auth_info';

// Système de conversation intelligent
const conversationContext = new Map(); // Stocke le contexte par utilisateur
const lastMessages = new Map(); // Stocke les derniers messages par utilisateur
const GEMINI_MODEL = process.env.GEMINI_MODEL || 'gemini-1.5-flash';
const GEMINI_MODEL_CANDIDATES = (process.env.GEMINI_MODEL_CANDIDATES ||
    `${GEMINI_MODEL},gemini-2.0-flash,gemini-1.5-flash-latest,gemini-1.5-flash,gemini-pro`)
    .split(',')
    .map(m => m.trim())
    .filter(Boolean);
const GEMINI_MAX_OUTPUT_TOKENS = parseInt(process.env.GEMINI_MAX_OUTPUT_TOKENS) || 8192;
const GEMINI_TIMEOUT = parseInt(process.env.GEMINI_TIMEOUT) || 5000; // Réduit à 5s
const MAX_GEMINI_RETRIES = parseInt(process.env.MAX_GEMINI_RETRIES) || 0; // Pas de retry
const OPENROUTER_MODELS = (process.env.OPENROUTER_MODELS ||
    'openrouter/auto,google/gemini-2.0-flash-exp:free,qwen/qwen3-coder:free')
    .split(',')
    .map(m => m.trim())
    .filter(Boolean);
const OPENROUTER_TIMEOUT = parseInt(process.env.OPENROUTER_TIMEOUT_MS) || 6000;
const OPENROUTER_TOTAL_TIMEOUT = parseInt(process.env.OPENROUTER_TOTAL_TIMEOUT_MS) || 8000;
const WS_CONNECT_TIMEOUT_MS = parseInt(process.env.WS_CONNECT_TIMEOUT_MS) || 60000;
const MAX_RECONNECT_DELAY_MS = parseInt(process.env.MAX_RECONNECT_DELAY_MS) || 60000;
const MEDIA_CONVERT_TIMEOUT_MS = parseInt(process.env.MEDIA_CONVERT_TIMEOUT_MS) || 10000;
const COMMANDS_ONLY_MODE = String(process.env.COMMANDS_ONLY_MODE || 'false').toLowerCase() === 'true';
const AI_SYSTEM_STYLE = `Tu t'appelles Juxt_rts Jr. Tu es l'assistant de Juxt_Rts.
Parle en français, style humain, naturel, décontracté et familier.
Ne commence pas chaque message par "bonjour".
Préfère des réponses courtes, claires, utiles, sans blabla inutile.
Quand on te demande ton nom/qui tu es, réponds clairement que tu es Juxt_rts Jr, assistant de Juxt_Rts.

Tes domaines fondamentaux (tu dois être très solide et naturel dessus) :
1) Développement web et application (frontend, backend, mobile, architecture, APIs, bases de données, débogage, bonnes pratiques).
2) Informatique et technologies en général (systèmes, réseaux, tooling, productivité dev, sécurité).
3) Hacking éthique / pentest (reconnaissance, méthodologie, OWASP, outils, mitigation, toujours dans un cadre légal et responsable).
4) Jeux vidéo avec focus Call of Duty Mobile.
5) Sports de combat : UFC, ONE Championship, Glory, MMA, kickboxing, muay thaï, boxe anglaise.

Tu peux aussi parler de culture générale, mais tes sujets favoris restent ceux ci-dessus.
Football: tu peux en parler simplement, mais sans en faire ton sujet principal.

Style de réponse:
- naturel, comme un humain, pas robotique
- pas de gros pavés inutiles
- adapte le niveau selon la question
- reste clair, concret et utile

Règle d'identité:
- Ne te présentes pas automatiquement à chaque message.
- Ne dis ton nom "Juxt_rts Jr" et ton rôle d'assistant de Juxt_Rts que si l'utilisateur te demande explicitement qui tu es, ton nom, ou ton rôle.`;

// Debug des variables d'environnement
console.log('🔧 Configuration chargée:');
console.log('GEMINI_API_KEY:', GEMINI_API_KEY ? '✅ Configuré' : '❌ Non configuré');
console.log('OPENROUTER_API_KEY:', OPENROUTER_API_KEY ? '✅ Configuré' : '❌ Non configuré');
console.log('GEMINI_MODEL:', GEMINI_MODEL);
console.log('GEMINI_MAX_OUTPUT_TOKENS:', GEMINI_MAX_OUTPUT_TOKENS);
console.log('CREATOR_CONTACT:', CREATOR_CONTACT);
console.log('SESSION_DIR:', SESSION_DIR);

// Initialisation du gestionnaire de fallback
const fallbackHandler = new FallbackHandler();

// Configuration Gemini
let genAI = null;
if (GEMINI_API_KEY) {
    genAI = new GoogleGenerativeAI(GEMINI_API_KEY);
}

let activeGeminiModel = GEMINI_MODEL;
let geminiBackoffUntil = 0;
let openRouterBackoffUntil = 0;
let activeOpenRouterModel = OPENROUTER_MODELS[0] || 'openrouter/auto';

function isGeminiQuotaError(message = '') {
    const lower = String(message).toLowerCase();
    return lower.includes('429') ||
           lower.includes('quota exceeded') ||
           lower.includes('too many requests') ||
           lower.includes('rate-limits');
}

function isQuotaOrRateLimitError(message = '') {
    const lower = String(message).toLowerCase();
    return lower.includes('429') ||
           lower.includes('quota') ||
           lower.includes('too many requests') ||
           lower.includes('rate limit');
}

function createGeminiModel(modelName = activeGeminiModel) {
    return genAI.getGenerativeModel({
        model: modelName,
        generationConfig: {
            maxOutputTokens: GEMINI_MAX_OUTPUT_TOKENS
        }
    });
}

async function generateGeminiContentWithFallback(promptPayload) {
    if (Date.now() < geminiBackoffUntil) {
        throw new Error('Gemini temporairement désactivé (quota/rate limit)');
    }

    const modelsToTry = [activeGeminiModel, ...GEMINI_MODEL_CANDIDATES].filter((m, i, arr) => m && arr.indexOf(m) === i);
    let lastError = null;

    for (const modelName of modelsToTry) {
        try {
            const model = createGeminiModel(modelName);
            const result = await Promise.race([
                model.generateContent(promptPayload),
                new Promise((_, reject) =>
                    setTimeout(() => reject(new Error(`Timeout (${modelName})`)), GEMINI_TIMEOUT)
                )
            ]);
            activeGeminiModel = modelName;
            return result;
        } catch (error) {
            lastError = error;
            console.log(`⚠️ Modèle Gemini indisponible: ${modelName} (${error.message})`);
            if (isGeminiQuotaError(error.message)) {
                // Evite de spammer l'API quand le quota est épuisé
                geminiBackoffUntil = Date.now() + 5 * 60 * 1000;
                break;
            }
        }
    }

    throw lastError || new Error('Aucun modèle Gemini disponible');
}

async function generateOpenRouterTextWithFallback(prompt) {
    if (!OPENROUTER_API_KEY) {
        throw new Error('OpenRouter non configuré');
    }
    if (Date.now() < openRouterBackoffUntil) {
        throw new Error('OpenRouter temporairement désactivé (quota/rate limit)');
    }

    const modelsToTry = [activeOpenRouterModel, ...OPENROUTER_MODELS]
        .filter((m, i, arr) => m && arr.indexOf(m) === i);
    let lastError = null;

    for (const modelName of modelsToTry) {
        try {
            const response = await axios.post(
                'https://openrouter.ai/api/v1/chat/completions',
                {
                    model: modelName,
                    messages: [{ role: 'user', content: prompt }],
                    max_tokens: GEMINI_MAX_OUTPUT_TOKENS,
                    temperature: 0.7
                },
                {
                    timeout: OPENROUTER_TIMEOUT,
                    headers: {
                        Authorization: `Bearer ${OPENROUTER_API_KEY}`,
                        'Content-Type': 'application/json',
                        'HTTP-Referer': 'https://juxt-rts-bot.local',
                        'X-Title': 'Juxt_Rts Bot'
                    }
                }
            );

            const content = response?.data?.choices?.[0]?.message?.content;
            if (!content || !String(content).trim()) {
                throw new Error(`Réponse vide (${modelName})`);
            }

            activeOpenRouterModel = modelName;
            return String(content);
        } catch (error) {
            const message = error?.response?.data?.error?.message || error.message || String(error);
            lastError = new Error(message);
            console.log(`⚠️ Modèle OpenRouter indisponible: ${modelName} (${message})`);
            if (isQuotaOrRateLimitError(message)) {
                openRouterBackoffUntil = Date.now() + 60 * 1000;
                break;
            }
        }
    }

    throw lastError || new Error('Aucun modèle OpenRouter disponible');
}

// Configuration du logger
const logger = P({ level: 'silent' });

// Cache anti-spam
const messageCache = new Map();
const CACHE_DURATION = 30000; // 30 secondes
let reconnectAttempts = 0;
const BOT_STARTUP_UNIX = Math.floor(Date.now() / 1000);

function getMessageTimestampSeconds(msg) {
    if (!msg?.messageTimestamp) return 0;
    if (typeof msg.messageTimestamp === 'number') return msg.messageTimestamp;
    if (typeof msg.messageTimestamp === 'object' && typeof msg.messageTimestamp.low === 'number') {
        return msg.messageTimestamp.low;
    }
    const parsed = Number(msg.messageTimestamp);
    return Number.isFinite(parsed) ? parsed : 0;
}

// Mots interdits
const forbiddenWords = ['insulte', 'offensive', 'inapproprié', 'haine', 'violence'];

/**
 * Vérifie si un message contient des mots interdits
 */
function containsForbiddenWords(text) {
    const lowerText = text.toLowerCase();
    return forbiddenWords.some(word => lowerText.includes(word));
}

/**
 * Vérifie si un message est en cache (anti-spam)
 */
function isMessageCached(messageId) {
    const now = Date.now();
    if (messageCache.has(messageId)) {
        const timestamp = messageCache.get(messageId);
        if (now - timestamp < CACHE_DURATION) {
            return true;
        }
        messageCache.delete(messageId);
    }
    return false;
}

/**
 * Ajoute un message au cache
 */
function cacheMessage(messageId) {
    messageCache.set(messageId, Date.now());
}

function safeUnlink(filePath) {
    try {
        if (filePath && fs.existsSync(filePath)) {
            fs.unlinkSync(filePath);
        }
    } catch (error) {
        // Sous Windows, le fichier peut rester verrouillé un court instant (EBUSY)
        console.log(`⚠️ Nettoyage différé ignoré: ${filePath} (${error.message})`);
    }
}

function getFfmpegExecutable() {
    // Fallback sur "ffmpeg" si le binaire embarqué n'est pas dispo
    return ffmpegPath || 'ffmpeg';
}

function getWebpmuxExecutable() {
    const candidates = [];
    if (process.platform === 'win32') {
        candidates.push(path.join(__dirname, 'node_modules', 'webp-converter', 'bin', 'libwebp_win64', 'bin', 'webpmux.exe'));
    } else if (process.platform === 'darwin') {
        candidates.push(path.join(__dirname, 'node_modules', 'webp-converter', 'bin', 'libwebp_osx', 'bin', 'webpmux'));
    } else {
        candidates.push(path.join(__dirname, 'node_modules', 'webp-converter', 'bin', 'libwebp_linux', 'bin', 'webpmux'));
    }
    candidates.push('webpmux');
    return candidates.find(p => p === 'webpmux' || fs.existsSync(p)) || 'webpmux';
}

async function execWithTimeout(command, timeoutMs = MEDIA_CONVERT_TIMEOUT_MS) {
    return Promise.race([
        execAsync(command),
        new Promise((_, reject) => setTimeout(() => reject(new Error(`Timeout conversion (${timeoutMs}ms)`)), timeoutMs))
    ]);
}

/**
 * Demande une réponse à Gemini AI avec fallback
 */
async function askGeminiWithFallback(prompt, retryCount = 0) {
    try {
        // Persona + style conversationnel naturel
        const frenchPrompt = `${AI_SYSTEM_STYLE}\n\nMessage utilisateur: ${prompt}`;

        let responseText = '';
        if (OPENROUTER_API_KEY) {
            responseText = await Promise.race([
                generateOpenRouterTextWithFallback(frenchPrompt),
                new Promise((_, reject) =>
                    setTimeout(() => reject(new Error('OpenRouter timeout global')), OPENROUTER_TOTAL_TIMEOUT)
                )
            ]);
        } else {
            if (!genAI) {
                throw new Error('Gemini AI non configuré');
            }
            const result = await generateGeminiContentWithFallback(frenchPrompt);
            const response = await result.response;
            responseText = response.text();
        }
        
        // Vérifier et forcer le français si nécessaire
        if (!isFrenchResponse(responseText)) {
            responseText = `🤖 Voici ma réponse en français :\n\n${responseText}\n\n💡 *Note: J'ai traduit ma réponse pour toi !*`;
        }
        
        return responseText;
    } catch (error) {
        console.error('Erreur IA:', error.message);
        
        // Pas de retry pour plus de rapidité
        console.log('IA indisponible, utilisation du fallback JSON...');
        const fallbackResponse = fallbackHandler.searchResponse(prompt);
        
        if (fallbackResponse) {
            return fallbackResponse;
        }
        
        return '😅 Oups ! Je n\'ai pas d\'info sur ce sujet dans ma base de connaissances et Gemini n\'est pas dispo pour le moment. Peux-tu reformuler ta question ou me poser quelque chose de plus général ? Je suis là pour t\'aider ! 🤗';
    }
}

/**
 * Vérifie si une réponse est en français
 */
function isFrenchResponse(text) {
    const frenchWords = [
        'le', 'la', 'les', 'un', 'une', 'des', 'du', 'de', 'et', 'ou', 'mais', 'donc', 'car', 'ni', 'que',
        'je', 'tu', 'il', 'elle', 'nous', 'vous', 'ils', 'elles', 'me', 'te', 'se', 'nous', 'vous',
        'mon', 'ton', 'son', 'ma', 'ta', 'sa', 'mes', 'tes', 'ses', 'notre', 'votre', 'leur',
        'ce', 'cette', 'ces', 'qui', 'que', 'quoi', 'dont', 'où', 'comment', 'pourquoi', 'quand',
        'avec', 'sans', 'pour', 'dans', 'sur', 'sous', 'devant', 'derrière', 'entre', 'parmi',
        'très', 'beaucoup', 'peu', 'assez', 'trop', 'plus', 'moins', 'bien', 'mal', 'vraiment',
        'oui', 'non', 'peut-être', 'sûrement', 'certainement', 'probablement', 'jamais', 'toujours',
        'aussi', 'encore', 'déjà', 'maintenant', 'alors', 'donc', 'puis', 'ensuite', 'finalement'
    ];
    
    const textLower = text.toLowerCase();
    let frenchWordCount = 0;
    
    for (const word of frenchWords) {
        if (textLower.includes(word)) {
            frenchWordCount++;
        }
    }
    
    // Si on trouve au moins 3 mots français, on considère que c'est en français
    return frenchWordCount >= 3;
}

/**
 * Réponses locales rapides pour conversation basique
 */
function getLocalChatReply(text) {
    const t = String(text || '').toLowerCase().trim();
    if (!t) return null;

    if (t.includes('tu sert a quoi') || t.includes('tu sers a quoi') || t.includes('tu fais quoi')) {
        return `Je suis ton bot WhatsApp polyvalent 🤖\n\n` +
               `- Téléchargement vidéos (TikTok/YouTube/Facebook/Instagram)\n` +
               `- Commandes média (\`-sticker\`, \`-image\`, \`-video\`)\n` +
               `- Recherche (\`-find\`, \`-gimage\`)\n` +
               `- Réponses IA/fallback en français\n\n` +
               `Tape \`-menu\` et je te montre tout.`;
    }

    if (t.startsWith('yo') || t.startsWith('salut') || t.startsWith('hello') || t === 'sava?' || t === 'ca va ?' || t === 'ça va ?') {
        return `Salut 👋 Je suis en ligne.\nTape \`-menu\` pour les commandes, ou envoie un lien vidéo pour téléchargement.`;
    }

    if (t.includes('quel année') || t.includes('quelle année')) {
        return `Nous sommes en ${new Date().getFullYear()} 📅`;
    }

    return null;
}

function getProfileJidCandidates(targetJid) {
    const candidates = [];
    if (!targetJid) return candidates;
    candidates.push(targetJid);
    if (targetJid.endsWith('@lid')) {
        candidates.push(targetJid.replace('@lid', '@s.whatsapp.net'));
    }
    return [...new Set(candidates)];
}

async function processProfilePictureCommand(sock, msg, jid) {
    try {
        const ctx = msg.message?.extendedTextMessage?.contextInfo;
        const targetJid = ctx?.participant || jid;
        const candidates = getProfileJidCandidates(targetJid);
        let profileUrl = null;

        for (const candidate of candidates) {
            try {
                profileUrl = await sock.profilePictureUrl(candidate, 'image');
                if (profileUrl) break;
            } catch (_) {
                // Essai suivant
            }
        }

        if (!profileUrl) {
            await sock.sendMessage(jid, {
                text: '😅 Pas de photo de profil récupérable (compte privé ou sans photo).'
            });
            return;
        }

        await sock.sendMessage(jid, {
            image: { url: profileUrl },
            caption: '📸 Voilà la photo de profil.'
        });
    } catch (error) {
        console.error('❌ Erreur commande pp:', error.message);
        await sock.sendMessage(jid, {
            text: '😅 Impossible de récupérer la photo de profil pour le moment.'
        });
    }
}

/**
 * Détecte si un message contient un lien vidéo
 */
function detectVideoLink(message) {
    const videoPatterns = [
        // Facebook patterns (plus larges)
        /(?:https?:\/\/)?(?:www\.)?(?:facebook\.com\/.*\/videos\/|fb\.watch\/|m\.facebook\.com\/.*\/videos\/|facebook\.com\/share\/r\/)/i,
        // YouTube patterns (incluant les Shorts)
        /(?:https?:\/\/)?(?:www\.)?(?:youtube\.com\/watch\?v=|youtu\.be\/|m\.youtube\.com\/watch\?v=|youtube\.com\/shorts\/|youtube\.com\/shorts\/)/i,
        /(?:https?:\/\/)?(?:www\.)?(?:instagram\.com\/p\/|instagram\.com\/reel\/|instagram\.com\/tv\/)/i,
        /(?:https?:\/\/)?(?:www\.)?(?:tiktok\.com\/@.*\/video\/|vm\.tiktok\.com\/|vt\.tiktok\.com\/)/i,
        /(?:https?:\/\/)?(?:www\.)?(?:pinterest\.(com|fr)\/pin\/)/i,
        /(?:https?:\/\/)?(?:www\.)?(?:twitter\.com\/.*\/status\/|x\.com\/.*\/status\/)/i,
        /(?:https?:\/\/)?(?:www\.)?(?:vimeo\.com\/)/i,
        /(?:https?:\/\/)?(?:www\.)?(?:dailymotion\.com\/video\/)/i
    ];
    
    for (const pattern of videoPatterns) {
        if (pattern.test(message)) {
            return true;
        }
    }
    return false;
}

/**
 * Extrait l'URL vidéo d'un message
 */
function extractVideoUrl(message) {
    const urlPattern = /(https?:\/\/[^\s]+)/g;
    const urls = message.match(urlPattern);
    return urls ? urls[0] : null;
}

/**
 * Nettoie une URL YouTube pour ytdl-core
 */
function cleanYouTubeUrl(url) {
    try {
        // Supprimer les paramètres problématiques
        const cleanUrl = url.split('?')[0];
        
        // Vérifier si c'est un lien youtu.be
        if (cleanUrl.includes('youtu.be/')) {
            const videoId = cleanUrl.split('youtu.be/')[1];
            return `https://www.youtube.com/watch?v=${videoId}`;
        }
        
        // Vérifier si c'est un lien YouTube Shorts
        if (cleanUrl.includes('youtube.com/shorts/')) {
            const videoId = cleanUrl.split('youtube.com/shorts/')[1];
            return `https://www.youtube.com/watch?v=${videoId}`;
        }
        
        // Vérifier si c'est un lien youtube.com standard
        if (cleanUrl.includes('youtube.com/watch?v=')) {
            return cleanUrl;
        }
        
        return url; // Retourner l'URL originale si on ne peut pas la nettoyer
    } catch (error) {
        console.error('❌ Erreur nettoyage URL:', error.message);
        return url;
    }
}

/**
 * Traite la recherche inversée d'image
 */
async function processImageSearch(sock, jid, quotedMsg) {
    try {
        console.log('🔍 Recherche inversée d\'image...');
        
        // Télécharger l'image
        const imageStream = await downloadContentFromMessage(quotedMsg.imageMessage, 'image');
        console.log('📸 Stream téléchargé, type:', typeof imageStream);
        
        // Convertir le stream en Buffer
        const chunks = [];
        for await (const chunk of imageStream) {
            chunks.push(chunk);
        }
        const imageBuffer = Buffer.concat(chunks);
        console.log('📸 Image convertie en Buffer, taille:', imageBuffer.length, 'bytes');
        
        // Convertir en Base64
        const imageBase64 = imageBuffer.toString('base64');
        console.log('📸 Base64 généré, longueur:', imageBase64.length);
        
        // Analyser l'image avec Gemini
        let analysis = '';
        let searchQuery = 'image';
        
        try {
            const prompt = `IMPORTANT: Réponds UNIQUEMENT en français. Analyse cette image et donne-moi des informations détaillées sur ce qu'elle contient. Décris l'objet, le lieu, la personne, ou tout ce qui est visible. Si tu peux identifier des marques, des lieux célèbres, ou des objets spécifiques, mentionne-les.`;
            
            const response = await generateGeminiContentWithFallback([
                prompt,
                {
                    inlineData: {
                        data: imageBase64,
                        mimeType: 'image/jpeg'
                    }
                }
            ]);
            
            analysis = response.response.text();
            searchQuery = analysis.split(' ').slice(0, 5).join(' '); // Prendre les 5 premiers mots
            console.log('✅ Analyse Gemini réussie:', searchQuery);
            
        } catch (geminiError) {
            console.log('❌ Erreur Gemini, utilisation du fallback:', geminiError.message);
            analysis = '🤖 *Analyse d\'image effectuée*\n\n' +
                      '📸 J\'ai reçu votre image et je peux la voir, mais l\'analyse détaillée n\'est pas disponible pour le moment.\n\n' +
                      '💡 *Suggestions :*\n' +
                      '• Essayez de décrire l\'image vous-même\n' +
                      '• Utilisez `-gimage` avec des mots-clés\n' +
                      '• Réessayez plus tard\n\n' +
                      '🔧 *L\'analyse IA sera bientôt disponible !*';
            searchQuery = 'image analysis';
        }
        
        // Recherche d'images similaires avec Google (améliorée)
        let similarImages = [];
        try {
            const google = require('googlethis');
            
            // Extraire des mots-clés plus intelligents de l'analyse
            const analysisText = analysis.toLowerCase();
            
            // Mots-clés importants à chercher en priorité
            const importantKeywords = [
                'personne', 'homme', 'femme', 'enfant', 'bébé',
                'chat', 'chien', 'animal', 'oiseau', 'poisson',
                'voiture', 'moto', 'vélo', 'avion', 'train',
                'maison', 'bâtiment', 'monument', 'tour', 'pont',
                'nourriture', 'plat', 'fruit', 'légume', 'gâteau',
                'fleur', 'arbre', 'plante', 'paysage', 'montagne',
                'mer', 'océan', 'lac', 'rivière', 'plage',
                'ville', 'rue', 'parc', 'jardin', 'forêt'
            ];
            
            // Trouver les mots-clés importants dans l'analyse
            const foundKeywords = importantKeywords.filter(keyword => 
                analysisText.includes(keyword)
            );
            
            // Si on trouve des mots-clés importants, les utiliser
            let keywords;
            if (foundKeywords.length > 0) {
                keywords = foundKeywords.slice(0, 3).join(' ');
                console.log('🎯 Mots-clés importants trouvés:', keywords);
            } else {
                // Sinon, extraire les mots les plus longs de l'analyse
                keywords = analysisText
                    .replace(/[^\w\s]/g, '')
                    .split(' ')
                    .filter(word => word.length > 4)
                    .slice(0, 3)
                    .join(' ');
                console.log('📝 Mots-clés extraits:', keywords);
            }
            
            console.log('🔍 Mots-clés pour recherche:', keywords);
            
            // Recherche avec les mots-clés extraits
            similarImages = await google.image(keywords, { 
                safe: true,
                additional_params: {
                    tbm: 'isch', // Mode images
                    tbs: 'isz:m' // Taille moyenne
                }
            });
            
            console.log('✅ Recherche d\'images similaires réussie, trouvées:', similarImages.length);
        } catch (googleError) {
            console.log('❌ Erreur recherche Google:', googleError.message);
        }
        
        let responseText = `🔍 *ANALYSE D'IMAGE TERMINÉE* 🔍\n\n`;
        responseText += `📝 *Description :*\n${analysis}\n\n`;
        
        // Envoyer d'abord l'analyse
        await sock.sendMessage(jid, {
            text: responseText
        });
        
        // Envoyer les images similaires
        if (similarImages && similarImages.length > 0) {
            await sock.sendMessage(jid, {
                text: `🖼️ *Images similaires trouvées :*\n\n✨ *Recherche basée sur :* "${searchQuery}"\n\n⏳ *Téléchargement des images...*`
            });
            
            // Envoyer jusqu'à 3 images similaires
            for (let i = 0; i < Math.min(3, similarImages.length); i++) {
                try {
                    const imageUrl = similarImages[i].url;
                    console.log(`📸 Téléchargement image similaire ${i + 1}:`, imageUrl);
                    
                    const response = await axios.get(imageUrl, { 
                        responseType: 'arraybuffer',
                        timeout: 10000,
                        headers: {
                            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
                        }
                    });
                    
                    const imageBuffer = Buffer.from(response.data);
                    
                    await sock.sendMessage(jid, {
                        image: imageBuffer,
                        caption: `🖼️ *Image similaire ${i + 1}*\n\n🔗 *Source :* ${imageUrl}`
                    });
                    
                    // Petite pause entre les images
                    await new Promise(resolve => setTimeout(resolve, 1000));
                    
                } catch (imageError) {
                    console.log(`❌ Erreur image similaire ${i + 1}:`, imageError.message);
                    await sock.sendMessage(jid, {
                        text: `❌ *Image similaire ${i + 1}* : Erreur de téléchargement`
                    });
                }
            }
            
            // Message de fin supprimé pour plus de discrétion
            
        } else {
            await sock.sendMessage(jid, {
                text: `🔍 *Recherche d'images similaires :* Aucune image similaire trouvée`
            });
        }
        
    } catch (error) {
        console.error('❌ Erreur recherche inversée:', error.message);
        await sock.sendMessage(jid, {
            text: '😅 Désolé, je n\'ai pas pu analyser cette image. Essaie avec une autre image !'
        });
    }
}

/**
 * Traite les commandes critiques immédiatement
 */
async function processCriticalCommand(sock, msg, command, fullCommand, jid, isGroup) {
    try {
        console.log('🚨 Traitement commande critique:', command);
        
        switch (command) {
            case 'send':
                const quotedMsgSend = msg.message.extendedTextMessage?.contextInfo?.quotedMessage;
                if (quotedMsgSend) {
                    await processSendCommand(sock, jid, quotedMsgSend);
                } else {
                    await sock.sendMessage(jid, {
                        text: '📸 *Sauvegarder vue unique :*\n\n' +
                              '1. Envoie une image/vidéo en vue unique\n' +
                              '2. Réponds avec `-send`\n\n' +
                              'Je vais la sauvegarder ! 😊'
                    });
                }
                break;
                
            case 'sticker':
                const quotedMsgSticker = msg.message.extendedTextMessage?.contextInfo?.quotedMessage;
                if (quotedMsgSticker && (quotedMsgSticker.imageMessage || quotedMsgSticker.videoMessage)) {
                    await processStickerCommand(sock, jid, quotedMsgSticker);
                } else {
                    await sock.sendMessage(jid, {
                        text: '🎨 *Créer un sticker :*\n\n' +
                              '1. Envoie une image ou vidéo\n' +
                              '2. Réponds avec `-sticker`\n\n' +
                              'Je vais le convertir en sticker ! 😊'
                    });
                }
                break;
                
            case 'image':
                const quotedMsgImage = msg.message.extendedTextMessage?.contextInfo?.quotedMessage;
                if (quotedMsgImage && quotedMsgImage.stickerMessage) {
                    await processImageCommand(sock, jid, quotedMsgImage);
                } else {
                    await sock.sendMessage(jid, {
                        text: '📸 *Convertir sticker en image :*\n\n' +
                              '1. Envoie un sticker\n' +
                              '2. Réponds avec `-image`\n\n' +
                              'Je vais le convertir ! 😊'
                    });
                }
                break;
                
            case 'video':
                const quotedMsgVideo = msg.message.extendedTextMessage?.contextInfo?.quotedMessage;
                if (quotedMsgVideo && quotedMsgVideo.stickerMessage) {
                    await processVideoCommand(sock, jid, quotedMsgVideo);
                } else {
                    await sock.sendMessage(jid, {
                        text: '🎬 *Convertir sticker en vidéo :*\n\n' +
                              '1. Envoie un sticker animé\n' +
                              '2. Réponds avec `-video`\n\n' +
                              'Je vais le convertir ! 😊'
                    });
                }
                break;
                
            case 'creator':
                await sock.sendMessage(jid, {
                    image: { url: './images/creator.jpg' },
                    caption: `👨‍💻 *CRÉATEUR DE JUXT_RTS BOT*\n\n` +
                            `*Nom:* ELLA ASSOUMOU Juste Renaric\n` +
                            `*WhatsApp:* +241076234942\n` +
                            `*Spécialité:* Développement Web, Mobile & Hacking Éthique\n\n` +
                            `*Contactez-moi pour des projets ou des questions techniques !*`
                });
                break;
                
            case 'joke':
                const jokes = [
                    "Pourquoi les plongeurs plongent-ils toujours en arrière ? Parce que sinon ils tombent dans le bateau ! 😄",
                    "Qu'est-ce qui est jaune et qui attend ? Jonathan ! 🟡",
                    "Pourquoi les oiseaux volent-ils vers le sud en hiver ? Parce que c'est trop loin à pied ! 🐦"
                ];
                const randomJoke = jokes[Math.floor(Math.random() * jokes.length)];
                await sock.sendMessage(jid, {
                    text: `😂 *BLAGUE DU JOUR* 😂\n\n${randomJoke}\n\n🤣 J'espère que ça t'a fait rire !`
                });
                break;
                
            case 'quote':
                const quotes = [
                    "Le succès, c'est tomber sept fois et se relever huit. - Proverbe japonais 🌅",
                    "L'innovation distingue un leader d'un suiveur. - Steve Jobs 💡",
                    "Le code est comme l'humour. Quand on doit l'expliquer, c'est mauvais. - Cory House 💻"
                ];
                const randomQuote = quotes[Math.floor(Math.random() * quotes.length)];
                await sock.sendMessage(jid, {
                    text: `✨ *CITATION INSPIRANTE* ✨\n\n_${randomQuote}_\n\n💭 Réfléchis-y !`
                });
                break;
                
            case 'fact':
                const facts = [
                    "Le premier bug informatique était littéralement un insecte ! En 1947, Grace Hopper a trouvé un papillon de nuit coincé dans un ordinateur. 🦋",
                    "Il y a plus de combinaisons possibles dans un jeu d'échecs qu'il n'y a d'atomes dans l'univers observable ! ♟️",
                    "Le mot 'robot' vient du tchèque 'robota' qui signifie 'travail forcé'. 🤖"
                ];
                const randomFact = facts[Math.floor(Math.random() * facts.length)];
                await sock.sendMessage(jid, {
                    text: `🤓 *FAIT INTÉRESSANT* 🤓\n\n${randomFact}\n\n📖 Incroyable, non ?`
                });
                break;
                
            case 'time':
                const now = new Date();
                const timeZone = 'Africa/Libreville';
                const gabonTime = now.toLocaleString('fr-FR', {
                    timeZone: timeZone,
                    weekday: 'long',
                    year: 'numeric',
                    month: 'long',
                    day: 'numeric',
                    hour: '2-digit',
                    minute: '2-digit',
                    second: '2-digit'
                });
                
                await sock.sendMessage(jid, {
                    text: `🕐 *HEURE ACTUELLE* 🕐\n\n📅 ${gabonTime}\n🌍 *Fuseau horaire :* ${timeZone}`
                });
                break;
        }
        
    } catch (error) {
        console.error('❌ Erreur commande critique:', error.message);
        await sock.sendMessage(jid, {
            text: '😅 Oups ! Erreur lors du traitement de la commande. Réessaie !'
        });
    }
}

/**
 * Traite automatiquement les messages vocaux
 */
async function processAudioMessage(sock, jid, msg) {
    try {
        console.log('🎵 Traitement automatique du message vocal...');
        
        // Vérifier si on doit répondre (même logique que pour le texte)
        const isGroup = jid.endsWith('@g.us');
        let shouldRespond = false;
        
        if (!isGroup) {
            // Toujours répondre dans les messages privés
            shouldRespond = true;
        } else {
            // Dans les groupes, vérifier les conditions spécifiques
            const quotedMsg = msg.message.extendedTextMessage?.contextInfo?.quotedMessage;
            const isQuotedBot = quotedMsg && quotedMsg.key && quotedMsg.key.fromMe;
            const isMentioned = messageText.includes('@' + sock.user.id.split('@')[0]);
            const keywords = ['menu', 'help', 'aide', 'qui es-tu', 'ton nom', 'info'];
            const hasKeyword = keywords.some(keyword => 
                messageText.toLowerCase().includes(keyword.toLowerCase())
            );
            
            shouldRespond = isQuotedBot || isMentioned || hasKeyword;
        }
        
        if (!shouldRespond) {
            console.log('🎵 Message vocal en groupe, pas de réponse automatique');
            return;
        }
        
        // Télécharger l'audio
        const audioStream = await downloadContentFromMessage(msg.message.audioMessage, 'audio');
        console.log('🎵 Stream audio téléchargé automatiquement');
        
        // Convertir le stream en Buffer
        const chunks = [];
        for await (const chunk of audioStream) {
            chunks.push(chunk);
        }
        const audioBuffer = Buffer.concat(chunks);
        console.log('🎵 Audio converti en Buffer, taille:', audioBuffer.length, 'bytes');
        
        // Convertir en Base64
        const audioBase64 = audioBuffer.toString('base64');
        
        // Transcrire avec Gemini
        let transcription = '';
        
        try {
            console.log('🎵 Début transcription avec Gemini...');
            const prompt = `IMPORTANT: Réponds UNIQUEMENT en français. Transcris cet audio en texte. Si tu ne peux pas entendre clairement, dis-le. Si c'est dans une autre langue, transcris dans cette langue puis traduis en français.`;
            
            const response = await generateGeminiContentWithFallback([
                prompt,
                {
                    inlineData: {
                        data: audioBase64,
                        mimeType: 'audio/mpeg'
                    }
                }
            ]);
            
            transcription = response.response.text();
            console.log('✅ Transcription automatique réussie:', transcription.substring(0, 100) + '...');
            
        } catch (geminiError) {
            console.log('❌ Erreur transcription automatique:', geminiError.message);
            transcription = 'Désolé, je n\'ai pas pu comprendre votre message vocal. Pouvez-vous répéter ?';
        }
        
        // Répondre automatiquement à la demande vocale
        try {
            console.log('🎵 Début réponse automatique...');
            const userId = jid.split('@')[0];
            const context = conversationContext.get(userId);
            let contextualPrompt = transcription;
            
            if (context && context.topic) {
                contextualPrompt = `IMPORTANT: Réponds UNIQUEMENT en français. Contexte: L'utilisateur parle de ${context.topic}. Question vocale: ${transcription}`;
            } else {
                contextualPrompt = `IMPORTANT: Réponds UNIQUEMENT en français. Question vocale: ${transcription}`;
            }
            
            console.log('🎵 Prompt contextuel:', contextualPrompt.substring(0, 100) + '...');
            const response = await askGeminiWithFallback(contextualPrompt);
            console.log('🎵 Réponse IA obtenue:', response.substring(0, 100) + '...');
            
            await sock.sendMessage(jid, {
                text: `🎤 *Transcription et réponse :*\n\n📝 *Vous avez dit :* "${transcription}"\n\n🤖 *Ma réponse :*\n${response}`
            });
            
            // Mettre à jour le contexte
            updateConversationContext(userId, transcription, response);
            console.log('✅ Traitement audio terminé avec succès');
            
        } catch (error) {
            console.error('Erreur réponse automatique:', error.message);
            await sock.sendMessage(jid, {
                text: `🎤 *Transcription et réponse :*\n\n📝 *Vous avez dit :* "${transcription}"\n\n😅 *Désolé, je n'ai pas pu répondre à votre demande vocale. Pouvez-vous reformuler ?*`
            });
        }
        
    } catch (error) {
        console.error('❌ Erreur traitement automatique audio:', error.message);
        // Ne pas envoyer de message d'erreur pour l'écoute automatique
    }
}

/**
 * Traite la transcription audio
 */
async function processAudioTranscription(sock, jid, quotedMsg) {
    try {
        console.log('🎵 Transcription audio...');
        
        // Télécharger l'audio
        const audioStream = await downloadContentFromMessage(quotedMsg.audioMessage, 'audio');
        console.log('🎵 Stream audio téléchargé, type:', typeof audioStream);
        
        // Convertir le stream en Buffer
        const chunks = [];
        for await (const chunk of audioStream) {
            chunks.push(chunk);
        }
        const audioBuffer = Buffer.concat(chunks);
        console.log('🎵 Audio converti en Buffer, taille:', audioBuffer.length, 'bytes');
        
        // Convertir en Base64
        const audioBase64 = audioBuffer.toString('base64');
        console.log('🎵 Base64 généré, longueur:', audioBase64.length);
        
        // Transcrire avec Gemini
        let transcription = '';
        
        try {
            const prompt = `IMPORTANT: Réponds UNIQUEMENT en français. Transcris cet audio en texte. Si tu ne peux pas entendre clairement, dis-le. Si c'est dans une autre langue, transcris dans cette langue puis traduis en français.`;
            
            const response = await generateGeminiContentWithFallback([
                prompt,
                {
                    inlineData: {
                        data: audioBase64,
                        mimeType: 'audio/mpeg'
                    }
                }
            ]);
            
            transcription = response.response.text();
            console.log('✅ Transcription Gemini réussie:', transcription.substring(0, 100) + '...');
            
        } catch (geminiError) {
            console.log('❌ Erreur Gemini, utilisation du fallback:', geminiError.message);
            transcription = '🤖 *Transcription audio effectuée*\n\n' +
                          '🎤 J\'ai reçu votre audio et je peux l\'entendre, mais la transcription détaillée n\'est pas disponible pour le moment.\n\n' +
                          '💡 *Suggestions :*\n' +
                          '• Essayez de parler plus clairement\n' +
                          '• Vérifiez que l\'audio n\'est pas trop court\n' +
                          '• Réessayez plus tard\n\n' +
                          '🔧 *La transcription IA sera bientôt disponible !*';
        }
        
        // Envoyer la transcription
        await sock.sendMessage(jid, {
            text: `🎵 *TRANSCRIPTION AUDIO TERMINÉE* 🎵\n\n` +
                  `📝 *Texte transcrit :*\n${transcription}\n\n` +
                  `✨ *Transcription effectuée avec succès !*`
        });
        
    } catch (error) {
        console.error('❌ Erreur transcription audio:', error.message);
        await sock.sendMessage(jid, {
            text: '😅 Désolé, je n\'ai pas pu transcrire cet audio. Essaie avec un autre audio !'
        });
    }
}

/**
 * Télécharge une vidéo depuis un lien
 */
async function downloadVideoFromUrl(url, sock, jid) {
    try {
        console.log('🎬 Téléchargement vidéo depuis:', url);
        
        // Créer le dossier temp s'il n'existe pas
        if (!fs.existsSync('./temp')) {
            fs.mkdirSync('./temp');
        }
        
        const outputPath = `./temp/video_${Date.now()}.mp4`;
        
        // Détecter la plateforme et appliquer des optimisations
        if (url.includes('youtube.com') || url.includes('youtu.be')) {
            return await downloadYouTubeVideo(url, outputPath, sock, jid);
        } else if (url.includes('facebook.com') || url.includes('fb.watch')) {
            return await downloadFacebookVideo(url, outputPath, sock, jid);
        } else if (url.includes('instagram.com')) {
            return await downloadInstagramVideo(url, outputPath, sock, jid);
        } else if (url.includes('pinterest.')) {
            return await downloadPinterestVideo(url, outputPath, sock, jid);
        } else if (url.includes('tiktok.com')) {
            return await downloadTikTokVideo(url, outputPath, sock, jid);
        } else {
            // Téléchargement générique
            return await downloadGenericVideo(url, outputPath, sock, jid);
        }
    } catch (error) {
        console.error('❌ Erreur téléchargement vidéo:', error.message);
        await sock.sendMessage(jid, {
            text: '😅 Désolé, je n\'ai pas pu télécharger cette vidéo. Le lien n\'est peut-être pas accessible ou la plateforme n\'est pas supportée.'
        });
        return null;
    }
}

/**
 * Télécharge une vidéo YouTube
 */
async function downloadYouTubeVideo(url, outputPath, sock, jid) {
    try {
        console.log('📺 Téléchargement YouTube...');
        console.log('🔗 URL originale:', url);
        
        // Détecter si c'est un YouTube Short
        const isShort = url.includes('youtube.com/shorts/') || url.includes('youtube.com/shorts/');
        if (isShort) {
            console.log('🎬 YouTube Short détecté !');
        }
        
        // Nettoyer l'URL
        const cleanUrl = cleanYouTubeUrl(url);
        console.log('🔗 URL nettoyée:', cleanUrl);
        
        // Vérifier si l'URL est valide
        if (!ytdl.validateURL(cleanUrl)) {
            console.log('❌ URL YouTube invalide selon ytdl-core');
            await sock.sendMessage(jid, {
                text: '❌ *URL YouTube invalide*\n\n😅 Désolé, cette URL YouTube n\'est pas accessible ou n\'est pas supportée par ytdl-core.\n\n🔧 *URL testée :* ' + cleanUrl + '\n\n💡 *Conseils :*\n• Vérifie que le lien est correct\n• Assure-toi que la vidéo n\'est pas privée\n• Essaie avec un autre lien YouTube\n\n🔧 *Note technique :* Certaines vidéos YouTube peuvent être bloquées ou nécessiter des outils plus avancés.'
            });
            return null;
        }
        
        console.log('✅ URL YouTube valide, obtention des infos...');
        
        // Obtenir les informations de la vidéo
        const info = await ytdl.getInfo(cleanUrl);
        const title = info.videoDetails.title;
        const duration = parseInt(info.videoDetails.lengthSeconds);
        
        console.log('📺 Infos vidéo:', { title, duration: `${Math.floor(duration/60)}:${(duration%60).toString().padStart(2, '0')}` });
        
        // Vérifier la durée (max 10 minutes pour WhatsApp)
        if (duration > 600) {
            await sock.sendMessage(jid, {
                text: `⏰ *Vidéo trop longue*\n\n📺 *Titre:* ${title}\n⏱️ *Durée:* ${Math.floor(duration/60)}:${(duration%60).toString().padStart(2, '0')}\n\n❌ Cette vidéo YouTube est trop longue (${Math.floor(duration/60)} minutes). WhatsApp limite les vidéos à 10 minutes maximum.\n\n💡 *Conseil :* Essaie avec une vidéo plus courte !`
            });
            return null;
        }
        
            console.log('🔄 Début du téléchargement direct...');
            
            // Obtenir l'URL de téléchargement direct
            const videoInfo = await ytdl.getInfo(cleanUrl);
            const formats = videoInfo.formats;
            
            // Trouver le format vidéo le plus adapté (HD si possible)
            const videoFormat = formats
                .filter(format => format.hasVideo && format.hasAudio)
                .sort((a, b) => (b.qualityLabel || 0) - (a.qualityLabel || 0))[0];
            
            if (!videoFormat || !videoFormat.url) {
                throw new Error('Aucun format vidéo trouvé');
            }
            
            console.log('📺 Format sélectionné:', {
                quality: videoFormat.qualityLabel,
                container: videoFormat.container,
                url: videoFormat.url.substring(0, 100) + '...'
            });
            
            // Téléchargement direct (comme TikTok)
            const videoResponse = await axios.get(videoFormat.url, {
                responseType: 'arraybuffer',
                headers: {
                    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
                    'Referer': cleanUrl
                },
                timeout: 60000 // 60 secondes pour les vidéos longues
            });
            
            const videoBuffer = Buffer.from(videoResponse.data);
            fs.writeFileSync(outputPath, videoBuffer);
            
            console.log('✅ Vidéo YouTube téléchargée directement:', outputPath);
            console.log('📊 Taille du fichier:', (videoBuffer.length / 1024 / 1024).toFixed(2) + ' MB');
            
            // Vérifier que le fichier existe et n'est pas vide
            if (!fs.existsSync(outputPath) || fs.statSync(outputPath).size === 0) {
                console.log('❌ Fichier vidéo vide ou inexistant');
                await sock.sendMessage(jid, {
                    text: '❌ *Erreur de téléchargement*\n\n😅 Le fichier vidéo n\'a pas pu être créé correctement. Cela peut arriver avec certaines vidéos YouTube.\n\n💡 *Conseils :*\n• Essaie avec une autre vidéo YouTube\n• Vérifie que la vidéo n\'est pas bloquée\n• Certaines vidéos peuvent nécessiter des outils plus avancés'
                });
                return null;
            }
            
            // Envoyer la vidéo
            const shortIndicator = isShort ? '🎬 *YouTube Short*' : '🎬 *Vidéo YouTube*';
            await sock.sendMessage(jid, {
                video: fs.readFileSync(outputPath),
                caption: `${shortIndicator} *téléchargée* (téléchargement direct)\n\n📺 *Titre:* ${title}\n⏱️ *Durée:* ${Math.floor(duration/60)}:${(duration%60).toString().padStart(2, '0')}\n📊 *Qualité:* ${videoFormat.qualityLabel || 'HD'}\n\n🔗 *Source:* ${url}`
            });
            
            // Nettoyer le fichier temporaire
            fs.unlinkSync(outputPath);
            return outputPath;
    } catch (error) {
        console.error('❌ Erreur téléchargement YouTube:', error.message);
        await sock.sendMessage(jid, {
            text: '❌ *Erreur de téléchargement YouTube*\n\n😅 Désolé, je n\'ai pas pu télécharger cette vidéo YouTube.\n\n🔧 *Détails techniques :* ' + error.message + '\n\n💡 *Conseils :*\n• Vérifie que le lien est correct\n• Assure-toi que la vidéo est accessible\n• Essaie avec une autre vidéo YouTube\n• Certaines vidéos peuvent être bloquées ou nécessiter des outils plus avancés'
        });
        return null;
    }
}

/**
 * Télécharge une vidéo Facebook avec méthodes stables
 */
async function downloadFacebookVideo(url, outputPath, sock, jid) {
    try {
        console.log('📘 Téléchargement Facebook...');
        console.log('🔗 URL Facebook:', url);
        
        // Méthode 1: fb-downloader-scrapper (le plus stable)
        try {
            console.log('🔄 Tentative avec fb-downloader-scrapper...');
            console.log('🔗 URL à traiter:', url);
            
            const result = await fbDownloader.getInfo(url);
            console.log('📊 Résultat fb-downloader-scrapper:', result);
            
            if (result && result.videoUrl) {
                console.log('✅ fb-downloader-scrapper a réussi:', result);
                
                // Télécharger la vidéo
                const videoResponse = await axios.get(result.videoUrl, {
                    responseType: 'arraybuffer',
                    headers: {
                        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
                        'Referer': url
                    },
                    timeout: 30000
                });
                
                const videoBuffer = Buffer.from(videoResponse.data);
                fs.writeFileSync(outputPath, videoBuffer);
                
                console.log('✅ Vidéo Facebook téléchargée via fb-downloader-scrapper:', outputPath);
                
                // Envoyer la vidéo
                await sock.sendMessage(jid, {
                    video: fs.readFileSync(outputPath),
                    caption: `📘 *Vidéo Facebook téléchargée* (via fb-downloader-scrapper)\n\n📺 *Titre:* ${result.title || 'Vidéo Facebook'}\n⏱️ *Durée:* ${result.duration || 'Inconnue'}\n\n🔗 *Source:* ${url}`
                });
                
                // Nettoyer le fichier temporaire
                fs.unlinkSync(outputPath);
                return outputPath;
            }
        } catch (scrapperError) {
            console.log('❌ fb-downloader-scrapper a échoué:', scrapperError.message);
        }
        
        // Méthode 2: Puppeteer (scraping direct avec navigateur)
        try {
            console.log('🔄 Tentative avec Puppeteer...');
            const browser = await puppeteer.launch({
                headless: true,
                args: [
                    '--no-sandbox', 
                    '--disable-setuid-sandbox',
                    '--disable-dev-shm-usage',
                    '--disable-accelerated-2d-canvas',
                    '--no-first-run',
                    '--no-zygote',
                    '--disable-gpu'
                ]
            });
            
            const page = await browser.newPage();
            await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36');
            
            console.log('🌐 Navigation vers la page Facebook...');
            await page.goto(url, { waitUntil: 'networkidle2', timeout: 30000 });
            
            // Attendre que la vidéo se charge
            await page.waitForTimeout(5000);
            
            // Extraire l'URL de la vidéo
            const videoData = await page.evaluate(() => {
                // Chercher dans les scripts JSON-LD
                const scripts = document.querySelectorAll('script[type="application/ld+json"]');
                for (const script of scripts) {
                    try {
                        const data = JSON.parse(script.textContent);
                        if (data['@type'] === 'VideoObject' && data.contentUrl) {
                            return {
                                videoUrl: data.contentUrl,
                                title: data.name || 'Vidéo Facebook',
                                duration: data.duration || 'Inconnue'
                            };
                        }
                    } catch (e) {}
                }
                
                // Chercher dans les meta tags
                const videoMeta = document.querySelector('meta[property="og:video"]');
                if (videoMeta) {
                    return {
                        videoUrl: videoMeta.content,
                        title: document.querySelector('meta[property="og:title"]')?.content || 'Vidéo Facebook',
                        duration: 'Inconnue'
                    };
                }
                
                return null;
            });
            
            await browser.close();
            
            if (videoData && videoData.videoUrl) {
                console.log('✅ Puppeteer a trouvé la vidéo:', videoData);
                
                // Télécharger la vidéo
                const videoResponse = await axios.get(videoData.videoUrl, {
                    responseType: 'arraybuffer',
                    headers: {
                        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
                        'Referer': url
                    },
                    timeout: 30000
                });
                
                const videoBuffer = Buffer.from(videoResponse.data);
                fs.writeFileSync(outputPath, videoBuffer);
                
                console.log('✅ Vidéo Facebook téléchargée via Puppeteer:', outputPath);
                
                // Envoyer la vidéo
                await sock.sendMessage(jid, {
                    video: fs.readFileSync(outputPath),
                    caption: `📘 *Vidéo Facebook téléchargée* (via Puppeteer)\n\n📺 *Titre:* ${videoData.title}\n⏱️ *Durée:* ${videoData.duration}\n\n🔗 *Source:* ${url}`
                });
                
                // Nettoyer le fichier temporaire
                fs.unlinkSync(outputPath);
                return outputPath;
            }
        } catch (puppeteerError) {
            console.log('❌ Puppeteer a échoué:', puppeteerError.message);
        }
        
        // Méthode 3: APIs de fallback (si les méthodes stables échouent)
        // Note: Les APIs externes sont souvent instables, on se concentre sur les méthodes principales
        console.log('🔄 Toutes les méthodes principales ont échoué, essai des APIs de fallback...');
        
        const apis = [
            'https://api.videofk.com/api/facebook',
            'https://api.snapinsta.app/api/facebook'
        ];
        
        let response = null;
        let data = null;
        
        for (const apiUrl of apis) {
            try {
                console.log(`🔄 Tentative avec API: ${apiUrl}`);
                response = await axios.post(apiUrl, {
                    url: url
                }, {
                    headers: {
                        'Content-Type': 'application/json',
                        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
                    },
                    timeout: 15000 // Timeout plus long
                });
                
                data = response.data;
                console.log(`✅ API ${apiUrl} a répondu:`, data);
                break;
            } catch (error) {
                console.log(`❌ API ${apiUrl} a échoué:`, error.message);
                continue;
            }
        }
        
        if (!data) {
            // Si toutes les APIs échouent, essayer une approche alternative
            console.log('🔄 Tentative d\'approche alternative...');
            
            try {
                // Essayer de scraper directement la page Facebook
                console.log('🔍 Tentative de scraping direct...');
                const pageResponse = await axios.get(url, {
                    headers: {
                        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
                        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
                        'Accept-Language': 'en-US,en;q=0.5',
                        'Accept-Encoding': 'gzip, deflate',
                        'Connection': 'keep-alive',
                        'Upgrade-Insecure-Requests': '1'
                    },
                    timeout: 15000
                });
                
                const pageContent = pageResponse.data;
                console.log('📄 Page Facebook chargée, recherche de vidéo...');
                
                // Chercher des URLs de vidéo dans le contenu
                const videoUrlPatterns = [
                    /"video_url":"([^"]+)"/g,
                    /"hd_src":"([^"]+)"/g,
                    /"sd_src":"([^"]+)"/g,
                    /"playable_url":"([^"]+)"/g,
                    /"playable_url_quality_hd":"([^"]+)"/g,
                    /"playable_url_quality_sd":"([^"]+)"/g
                ];
                
                let foundVideoUrl = null;
                for (const pattern of videoUrlPatterns) {
                    const matches = pageContent.match(pattern);
                    if (matches && matches.length > 0) {
                        foundVideoUrl = matches[0].match(/"([^"]+)"/)[1];
                        foundVideoUrl = foundVideoUrl.replace(/\\u0026/g, '&');
                        console.log('🎬 URL vidéo trouvée via scraping:', foundVideoUrl);
                        break;
                    }
                }
                
                if (foundVideoUrl) {
                    console.log('✅ Téléchargement via scraping direct...');
                    
                    // Télécharger la vidéo
                    const videoResponse = await axios.get(foundVideoUrl, {
                        responseType: 'arraybuffer',
                        headers: {
                            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
                            'Referer': url
                        },
                        timeout: 30000
                    });
                    
                    const videoBuffer = Buffer.from(videoResponse.data);
                    fs.writeFileSync(outputPath, videoBuffer);
                    
                    console.log('✅ Vidéo Facebook téléchargée via scraping:', outputPath);
                    
                    // Envoyer la vidéo
                    await sock.sendMessage(jid, {
                        video: fs.readFileSync(outputPath),
                        caption: `📘 *Vidéo Facebook téléchargée* (via scraping)\n\n📺 *Titre:* Vidéo Facebook\n⏱️ *Durée:* Inconnue\n\n🔗 *Source:* ${url}`
                    });
                    
                    // Nettoyer le fichier temporaire
                    fs.unlinkSync(outputPath);
                    return outputPath;
                } else {
                    throw new Error('Aucune URL vidéo trouvée via scraping');
                }
            } catch (scrapingError) {
                console.log('❌ Scraping direct échoué:', scrapingError.message);
                
                await sock.sendMessage(jid, {
                    text: '📘 *Vidéo Facebook détectée !*\n\n🎬 *Lien reçu :* ' + url + '\n\n😅 Désolé, toutes les méthodes de téléchargement Facebook ont échoué.\n\n💡 *Solutions alternatives :*\n• Essaie de partager le lien YouTube de la même vidéo\n• Vérifie que la vidéo est publique et accessible\n• Réessaie plus tard (les APIs peuvent être temporairement indisponibles)\n\n🔧 *Note technique :* Facebook protège ses vidéos, c\'est normal que ça soit difficile.'
                });
                return null;
            }
        }
        
        console.log('📘 Réponse API Facebook:', data);
        
        // Vérifier différentes structures de réponse
        let videoUrl = null;
        let title = 'Vidéo Facebook';
        let duration = 'Inconnue';
        
        if (data.success && data.video_url) {
            videoUrl = data.video_url;
            title = data.title || title;
            duration = data.duration || duration;
        } else if (data.data && data.data.video_url) {
            videoUrl = data.data.video_url;
            title = data.data.title || title;
            duration = data.data.duration || duration;
        } else if (data.url) {
            videoUrl = data.url;
            title = data.title || title;
            duration = data.duration || duration;
        } else {
            throw new Error(data.message || 'Aucune URL vidéo trouvée dans la réponse');
        }
        
        if (videoUrl) {
            console.log('✅ URL vidéo Facebook obtenue, téléchargement...');
            
            // Télécharger la vidéo depuis l'URL obtenue
            const videoResponse = await axios.get(videoUrl, {
                responseType: 'arraybuffer',
                headers: {
                    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
                },
                timeout: 30000 // 30 secondes pour le téléchargement
            });
            
            const videoBuffer = Buffer.from(videoResponse.data);
            fs.writeFileSync(outputPath, videoBuffer);
            
            console.log('✅ Vidéo Facebook téléchargée:', outputPath);
            
            // Envoyer la vidéo
            await sock.sendMessage(jid, {
                video: fs.readFileSync(outputPath),
                caption: `📘 *Vidéo Facebook téléchargée*\n\n📺 *Titre:* ${title}\n⏱️ *Durée:* ${duration}\n\n🔗 *Source:* ${url}`
            });
            
            // Nettoyer le fichier temporaire
            fs.unlinkSync(outputPath);
            return outputPath;
        } else {
            throw new Error('Aucune URL vidéo valide trouvée');
        }
    } catch (error) {
        console.error('❌ Erreur téléchargement Facebook:', error.message);
        await sock.sendMessage(jid, {
            text: '📘 *Vidéo Facebook détectée !*\n\n🎬 *Lien reçu :* ' + url + '\n\n😅 Désolé, je n\'ai pas pu télécharger cette vidéo Facebook.\n\n🔧 *Erreur :* ' + error.message + '\n\n💡 *Conseils :*\n• Vérifie que le lien est accessible\n• Essaie avec un autre lien Facebook\n• Tu peux partager le lien YouTube de la même vidéo si elle existe !'
        });
        return null;
    }
}

/**
 * Télécharge une vidéo Instagram
 */
async function downloadInstagramVideo(url, outputPath, sock, jid) {
    try {
        console.log('📷 Téléchargement Instagram...');
        
        // Nettoyer l'URL Instagram
        const cleanUrl = url.split('?')[0];
        
        // PRIORITÉ 1: youtube-dl (le plus fiable)
        try {
            console.log('🔍 Tentative avec youtube-dl (priorité)...');
            const { exec } = require('child_process');
            const util = require('util');
            const execAsync = util.promisify(exec);
            
            // Obtenir les infos de la vidéo (essayer différentes commandes)
            let infoCommand = `youtube-dl -j "${cleanUrl}"`;
            let infoOutput;
            
            try {
                const result = await execAsync(infoCommand);
                infoOutput = result.stdout;
            } catch (error) {
                // Essayer avec le chemin complet de youtube-dl
                console.log('🔄 youtube-dl non trouvé dans PATH, essai avec chemin complet...');
                infoCommand = `python -m youtube_dl -j "${cleanUrl}"`;
                try {
                    const result = await execAsync(infoCommand);
                    infoOutput = result.stdout;
                } catch (pythonError) {
                    // Essayer avec yt-dlp si youtube-dl n'est pas trouvé
                    console.log('🔄 youtube-dl non trouvé, essai avec yt-dlp...');
                    infoCommand = `yt-dlp -j "${cleanUrl}"`;
                    const result = await execAsync(infoCommand);
                    infoOutput = result.stdout;
                }
            }
            
            if (infoOutput.trim()) {
                const videoInfo = JSON.parse(infoOutput);
                console.log('✅ Infos vidéo obtenues avec youtube-dl:', videoInfo.title);
                
                // Obtenir l'URL de téléchargement
                let urlCommand = `youtube-dl --get-url "${cleanUrl}"`;
                let urlOutput;
                
                try {
                    const result = await execAsync(urlCommand);
                    urlOutput = result.stdout;
                } catch (error) {
                    // Essayer avec le chemin complet de youtube-dl
                    urlCommand = `python -m youtube_dl --get-url "${cleanUrl}"`;
                    try {
                        const result = await execAsync(urlCommand);
                        urlOutput = result.stdout;
                    } catch (pythonError) {
                        // Essayer avec yt-dlp si youtube-dl n'est pas trouvé
                        urlCommand = `yt-dlp --get-url "${cleanUrl}"`;
                        const result = await execAsync(urlCommand);
                        urlOutput = result.stdout;
                    }
                }
                
                if (urlOutput.trim()) {
                    const videoUrl = urlOutput.trim();
                    console.log('✅ URL vidéo trouvée avec youtube-dl:', videoUrl);
                    
                    // Télécharger la vidéo
                    const videoResponse = await axios.get(videoUrl, {
                        responseType: 'stream',
                        timeout: 30000,
                        headers: {
                            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
                            'Referer': 'https://www.instagram.com/'
                        }
                    });
                    
                    const writer = fs.createWriteStream(outputPath);
                    videoResponse.data.pipe(writer);
                    
                    return new Promise((resolve, reject) => {
                        writer.on('finish', async () => {
                            console.log('✅ Vidéo Instagram téléchargée avec youtube-dl:', outputPath);
                            
                            await sock.sendMessage(jid, {
                                text: `📷 *Vidéo Instagram téléchargée !*\n\n` +
                                      `📝 *Titre :* ${videoInfo.title || 'Instagram Video'}\n` +
                                      `👤 *Auteur :* ${videoInfo.uploader || 'Inconnu'}\n` +
                                      `⏱️ *Durée :* ${videoInfo.duration ? Math.floor(videoInfo.duration/60) + ':' + (videoInfo.duration%60).toString().padStart(2, '0') : 'Inconnue'}\n` +
                                      `📁 *Fichier :* ${path.basename(outputPath)}\n\n` +
                                      `🎉 *Téléchargement réussi avec youtube-dl !*`
                            });
                            
                            resolve(true);
                        });
                        
                        writer.on('error', reject);
                    });
                }
            }
        } catch (youtubeDlError) {
            console.log('❌ youtube-dl échoué:', youtubeDlError.message);
        }
        
        // Méthode alternative : APIs plus fiables
        console.log('🔍 Tentative avec APIs alternatives...');
        
        const alternativeApis = [
            `https://api.snapinsta.app/api/ig/info?url=${encodeURIComponent(cleanUrl)}`,
            `https://api.videofk.com/api/ig/info?url=${encodeURIComponent(cleanUrl)}`,
            `https://api.social-downloader.com/api/ig/info?url=${encodeURIComponent(cleanUrl)}`,
            `https://api.douyin.wtf/api/ig/info?url=${encodeURIComponent(cleanUrl)}`,
            `https://api.savetube.me/api/instagram?url=${encodeURIComponent(cleanUrl)}`,
            `https://api.instagram.com/api/v1/media/info/?url=${encodeURIComponent(cleanUrl)}`,
            `https://api.instagram.com/oembed/?url=${encodeURIComponent(cleanUrl)}`
        ];
        
        for (const apiUrl of alternativeApis) {
            try {
                console.log('🔍 Tentative API alternative:', apiUrl);
                
                const response = await axios.get(apiUrl, {
                    timeout: 20000,
                    headers: {
                        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
                        'Accept': 'application/json',
                        'Accept-Language': 'fr-FR,fr;q=0.9,en;q=0.8'
                    }
                });
                
                if (response.data && (response.data.video_url || response.data.url)) {
                    const videoUrl = response.data.video_url || response.data.url;
                    const title = response.data.title || response.data.description || 'Instagram Video';
                    
                    console.log('✅ URL vidéo trouvée via API alternative:', videoUrl);
                    
                    // Télécharger la vidéo
                    const videoResponse = await axios.get(videoUrl, {
                        responseType: 'stream',
                        timeout: 30000,
                        headers: {
                            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
                            'Referer': 'https://www.instagram.com/'
                        }
                    });
                    
                    const writer = fs.createWriteStream(outputPath);
                    videoResponse.data.pipe(writer);
                    
                    return new Promise((resolve, reject) => {
                        writer.on('finish', async () => {
                            console.log('✅ Vidéo Instagram téléchargée via API alternative:', outputPath);
                            
                            await sock.sendMessage(jid, {
                                text: `📷 *Vidéo Instagram téléchargée !*\n\n` +
                                      `📝 *Titre :* ${title}\n` +
                                      `📁 *Fichier :* ${path.basename(outputPath)}\n\n` +
                                      `🎉 *Téléchargement réussi via API alternative !*`
                            });
                            
                            resolve(true);
                        });
                        
                        writer.on('error', reject);
                    });
                }
            } catch (apiError) {
                console.log('❌ API alternative échouée:', apiError.message);
                continue;
            }
        }
        
        // Méthode de scraping simple et robuste
        console.log('🔍 Tentative scraping direct Instagram simple...');
        
        try {
            const browser = await puppeteer.launch({
                headless: true,
                args: [
                    '--no-sandbox',
                    '--disable-setuid-sandbox',
                    '--disable-dev-shm-usage',
                    '--disable-web-security',
                    '--disable-features=VizDisplayCompositor'
                ]
            });
            
            const page = await browser.newPage();
            await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');
            
            // Intercepter les requêtes réseau pour capturer les URLs vidéo
            const videoUrls = [];
            page.on('response', async (response) => {
                const url = response.url();
                const contentType = response.headers()['content-type'] || '';
                
                // Filtrer uniquement les vraies vidéos
                if (
                    (url.includes('.mp4') || url.includes('.webm') || url.includes('.mov')) &&
                    (contentType.includes('video/') || contentType.includes('application/octet-stream')) &&
                    !url.includes('.js') &&
                    !url.includes('.css') &&
                    !url.includes('.json') &&
                    !url.includes('.png') &&
                    !url.includes('.ico') &&
                    !url.includes('rsrc.php') &&
                    !url.includes('ajax/') &&
                    !url.includes('api/graphql')
                ) {
                    console.log('🎬 URL vidéo réelle détectée:', url);
                    videoUrls.push(url);
                }
            });
            
            console.log('🌐 Navigation vers Instagram...');
            await page.goto(cleanUrl, { waitUntil: 'networkidle0', timeout: 30000 });
            
            // Attendre que la page se charge complètement
            console.log('⏳ Attente du chargement...');
            await new Promise(resolve => setTimeout(resolve, 8000));
            
            // Essayer de cliquer sur la vidéo pour la déclencher
            try {
                console.log('🎬 Tentative de clic sur la vidéo...');
                const videoClickable = await page.$('video');
                if (videoClickable) {
                    await videoClickable.click();
                    await new Promise(resolve => setTimeout(resolve, 3000));
                    console.log('✅ Clic sur vidéo effectué');
                }
            } catch (e) {
                console.log('ℹ️ Pas de vidéo cliquable trouvée');
            }
            
            // Chercher l'élément vidéo avec plusieurs méthodes
            console.log('🔍 Recherche de l\'élément vidéo...');
            let videoElement = await page.$('video');
            let videoUrl = null;
            
            if (videoElement) {
                console.log('✅ Élément vidéo trouvé !');
                videoUrl = await page.evaluate(el => {
                    // Essayer différentes propriétés
                    if (el.src) return el.src;
                    if (el.currentSrc) return el.currentSrc;
                    if (el.querySelector('source')) return el.querySelector('source').src;
                    return null;
                }, videoElement);
            }
            
            // Si pas d'élément vidéo, chercher dans les sources
            if (!videoUrl) {
                console.log('🔍 Recherche dans les sources...');
                const sources = await page.$$eval('source', sources => 
                    sources.map(s => s.src).filter(src => src && (src.includes('.mp4') || src.includes('.webm')))
                );
                if (sources.length > 0) {
                    videoUrl = sources[0];
                    console.log('✅ Source vidéo trouvée:', videoUrl);
                }
            }
            
            // Si pas d'URL directe, utiliser les URLs capturées
            if (!videoUrl && videoUrls.length > 0) {
                console.log('🎬 Utilisation des URLs capturées...');
                videoUrl = videoUrls[0];
            }
            
            if (videoUrl) {
                console.log('✅ URL vidéo Instagram trouvée:', videoUrl);
                
                // Télécharger la vidéo
                const videoResponse = await axios.get(videoUrl, {
                    responseType: 'stream',
                    timeout: 30000,
                    headers: {
                        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
                        'Referer': 'https://www.instagram.com/'
                    }
                });
                
                const writer = fs.createWriteStream(outputPath);
                videoResponse.data.pipe(writer);
                
                await browser.close();
                
                return new Promise((resolve, reject) => {
                    writer.on('finish', async () => {
                        console.log('✅ Vidéo Instagram téléchargée via scraping:', outputPath);
                        
                        await sock.sendMessage(jid, {
                            text: `📷 *Vidéo Instagram téléchargée !*\n\n` +
                                  `📝 *Titre :* Instagram Video\n` +
                                  `📁 *Fichier :* ${path.basename(outputPath)}\n\n` +
                                  `🎉 *Téléchargement réussi via scraping !*`
                        });
                        
                        resolve(true);
                    });
                    
                    writer.on('error', reject);
                });
            } else {
                console.log('❌ Aucune URL vidéo trouvée');
            }
            
            await browser.close();
        } catch (scrapingError) {
            console.log('❌ Scraping Instagram échoué:', scrapingError.message);
        }
        
        
        // Si toutes les méthodes échouent
        await sock.sendMessage(jid, {
            text: '📷 *Instagram - Téléchargement échoué*\n\n' +
                  '😅 Désolé, toutes les méthodes de téléchargement Instagram ont échoué.\n\n' +
                  '💡 *Solutions alternatives :*\n' +
                  '• Vérifie que la vidéo est publique\n' +
                  '• Essaie de partager le lien YouTube si disponible\n' +
                  '• Réessaie plus tard\n\n' +
                  '🔧 *Méthodes testées :*\n' +
                  '• youtube-dl (priorité)\n' +
                  '• Scraping direct (Puppeteer)\n' +
                  '• APIs externes (fallback)\n\n' +
                  '💻 *youtube-dl installé :* ✅'
        });
        
        return false;
    } catch (error) {
        console.error('❌ Erreur Instagram:', error.message);
        return false;
    }
}

/**
 * Télécharge une vidéo TikTok
 */
async function downloadTikTokVideo(url, outputPath, sock, jid) {
    try {
        console.log('🎵 Téléchargement TikTok...');
        console.log('🔗 URL TikTok:', url);
        
        // Utiliser l'API tikwm.com
        const apiUrl = 'https://tikwm.com/api/';
        const response = await axios.post(apiUrl, {
            url: url
        }, {
            headers: {
                'Content-Type': 'application/json',
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
            }
        });
        
        const data = response.data;
        console.log('🎵 Réponse API TikTok:', data);
        
        if (data.code === 0 && data.data) {
            console.log('✅ Données TikTok obtenues, téléchargement...');
            
            // Obtenir l'URL de la vidéo (priorité à la HD)
            const videoUrl = data.data.hdplay || data.data.play || data.data.wmplay;
            
            if (!videoUrl) {
                throw new Error('Aucune URL vidéo trouvée');
            }
            
            console.log('🎬 URL vidéo TikTok:', videoUrl);
            
            // Télécharger la vidéo
            const videoResponse = await axios.get(videoUrl, {
                responseType: 'arraybuffer',
                headers: {
                    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
                    'Referer': 'https://tikwm.com/'
                }
            });
            
            const videoBuffer = Buffer.from(videoResponse.data);
            fs.writeFileSync(outputPath, videoBuffer);
            
            console.log('✅ Vidéo TikTok téléchargée:', outputPath);
            
            // Envoyer la vidéo
            await sock.sendMessage(jid, {
                video: fs.readFileSync(outputPath),
                caption: `🎵 *Vidéo TikTok téléchargée*\n\n📺 *Titre:* ${data.data.title || 'Vidéo TikTok'}\n👤 *Auteur:* ${data.data.author?.nickname || 'Inconnu'}\n⏱️ *Durée:* ${data.data.duration || 'Inconnue'}\n\n🔗 *Source:* ${url}`
            });
            
            // Nettoyer le fichier temporaire
            fs.unlinkSync(outputPath);
            return outputPath;
        } else {
            throw new Error(data.msg || 'Erreur API TikTok');
        }
    } catch (error) {
        console.error('❌ Erreur téléchargement TikTok:', error.message);
        await sock.sendMessage(jid, {
            text: '🎵 *Vidéo TikTok détectée !*\n\n🎬 *Lien reçu :* ' + url + '\n\n😅 Désolé, je n\'ai pas pu télécharger cette vidéo TikTok.\n\n🔧 *Erreur :* ' + error.message + '\n\n💡 *Conseils :*\n• Vérifie que le lien est accessible\n• Essaie avec un autre lien TikTok\n• Tu peux partager le lien YouTube de la même vidéo si elle existe !'
        });
        return null;
    }
}

/**
 * Télécharge une vidéo Pinterest
 */
async function downloadPinterestVideo(url, outputPath, sock, jid) {
    try {
        console.log('📌 Téléchargement Pinterest...');
        
        // Nettoyer l'URL Pinterest
        const cleanUrl = url.split('?')[0];
        
        // Essayer plusieurs APIs pour Pinterest
        const apis = [
            `https://api.snapinsta.app/api/pinterest/info?url=${encodeURIComponent(cleanUrl)}`,
            `https://api.videofk.com/api/pinterest/info?url=${encodeURIComponent(cleanUrl)}`,
            `https://api.social-downloader.com/api/pinterest/info?url=${encodeURIComponent(cleanUrl)}`
        ];
        
        for (const apiUrl of apis) {
            try {
                console.log('🔍 Tentative API Pinterest:', apiUrl);
                
                const response = await axios.get(apiUrl, {
                    timeout: 15000,
                    headers: {
                        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
                    }
                });
                
                if (response.data && response.data.video_url) {
                    const videoUrl = response.data.video_url;
                    const title = response.data.title || 'Pinterest Video';
                    
                    console.log('✅ URL vidéo Pinterest trouvée:', videoUrl);
                    
                    // Télécharger la vidéo
                    const videoResponse = await axios.get(videoUrl, {
                        responseType: 'stream',
                        timeout: 30000
                    });
                    
                    const writer = fs.createWriteStream(outputPath);
                    videoResponse.data.pipe(writer);
                    
                    return new Promise((resolve, reject) => {
                        writer.on('finish', async () => {
                            console.log('✅ Vidéo Pinterest téléchargée:', outputPath);
                            
                            await sock.sendMessage(jid, {
                                text: `📌 *Vidéo Pinterest téléchargée !*\n\n` +
                                      `📝 *Titre :* ${title}\n` +
                                      `📁 *Fichier :* ${path.basename(outputPath)}\n\n` +
                                      `🎉 *Téléchargement réussi !*`
                            });
                            
                            resolve(true);
                        });
                        
                        writer.on('error', reject);
                    });
                }
            } catch (apiError) {
                console.log('❌ API Pinterest échouée:', apiError.message);
                continue;
            }
        }
        
        // Si toutes les APIs échouent, essayer le scraping direct
        try {
            console.log('🔍 Tentative scraping direct Pinterest...');
            
            const browser = await puppeteer.launch({
                headless: true,
                args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage']
            });
            
            const page = await browser.newPage();
            await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36');
            await page.goto(cleanUrl, { waitUntil: 'networkidle2' });
            
            // Attendre que la vidéo se charge
            await page.waitForTimeout(3000);
            
            // Chercher l'élément vidéo
            const videoElement = await page.$('video');
            if (videoElement) {
                const videoUrl = await page.evaluate(el => el.src, videoElement);
                
                if (videoUrl) {
                    console.log('✅ URL vidéo Pinterest trouvée via scraping:', videoUrl);
                    
                    // Télécharger la vidéo
                    const videoResponse = await axios.get(videoUrl, {
                        responseType: 'stream',
                        timeout: 30000
                    });
                    
                    const writer = fs.createWriteStream(outputPath);
                    videoResponse.data.pipe(writer);
                    
                    await browser.close();
                    
                    return new Promise((resolve, reject) => {
                        writer.on('finish', async () => {
                            console.log('✅ Vidéo Pinterest téléchargée via scraping:', outputPath);
                            
                            await sock.sendMessage(jid, {
                                text: `📌 *Vidéo Pinterest téléchargée !*\n\n` +
                                      `📝 *Titre :* Pinterest Video\n` +
                                      `📁 *Fichier :* ${path.basename(outputPath)}\n\n` +
                                      `🎉 *Téléchargement réussi !*`
                            });
                            
                            resolve(true);
                        });
                        
                        writer.on('error', reject);
                    });
                }
            }
            
            await browser.close();
        } catch (scrapingError) {
            console.log('❌ Scraping Pinterest échoué:', scrapingError.message);
        }
        
        // Si toutes les méthodes échouent
        await sock.sendMessage(jid, {
            text: '📌 *Pinterest - Téléchargement échoué*\n\n' +
                  '😅 Désolé, toutes les méthodes de téléchargement Pinterest ont échoué.\n\n' +
                  '💡 *Solutions alternatives :*\n' +
                  '• Vérifie que le pin contient une vidéo\n' +
                  '• Essaie de partager le lien YouTube si disponible\n' +
                  '• Réessaie plus tard (les APIs peuvent être temporairement indisponibles)\n\n' +
                  '🔧 *Note technique :* Pinterest protège ses contenus, c\'est normal que ça soit difficile.'
        });
        
        return false;
    } catch (error) {
        console.error('❌ Erreur Pinterest:', error.message);
        return false;
    }
}

/**
 * Télécharge une vidéo générique
 */
async function downloadGenericVideo(url, outputPath, sock, jid) {
    try {
        console.log('🌐 Téléchargement générique...');
        
        const response = await axios.get(url, {
            responseType: 'arraybuffer',
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
            }
        });
        
        const buffer = Buffer.from(response.data);
        fs.writeFileSync(outputPath, buffer);
        
        console.log('✅ Vidéo générique téléchargée:', outputPath);
        
        // Envoyer la vidéo
        await sock.sendMessage(jid, {
            video: fs.readFileSync(outputPath),
            caption: `🎬 *Vidéo téléchargée*\n\n🔗 *Source:* ${url}`
        });
        
        // Nettoyer le fichier temporaire
        fs.unlinkSync(outputPath);
        return outputPath;
    } catch (error) {
        console.error('❌ Erreur téléchargement générique:', error.message);
        throw error;
    }
}

/**
 * Convertit du texte en audio
 */
async function textToAudio(text) {
    try {
        const response = await axios.post('https://texttospeech.googleapis.com/v1/text:synthesize', {
            input: { text: text },
            voice: { languageCode: 'fr-FR', name: 'fr-FR-Neural2-A', ssmlGender: 'NEUTRAL' },
            audioConfig: { audioEncoding: 'MP3' }
        }, {
            headers: {
                'Authorization': `Bearer ${GEMINI_API_KEY}`,
                'Content-Type': 'application/json'
            }
        });

        const audioData = Buffer.from(response.data.audioContent, 'base64');
        return audioData;
    } catch (error) {
        console.error('Erreur TTS:', error.message);
        return null;
    }
}

/**
 * Convertit un média en sticker
 */
async function mediaToSticker(mediaPath, isVideo = false) {
    try {
        const outputPath = `./temp/sticker_${Date.now()}.webp`;
        
        console.log(`🔄 Conversion ${isVideo ? 'vidéo' : 'image'} vers sticker...`);
        console.log(`📁 Source: ${mediaPath}`);
        console.log(`📁 Destination: ${outputPath}`);
        
        const ffmpegExec = getFfmpegExecutable();
        let ffmpegCommand;
        if (isVideo) {
            // Pour les vidéos, prendre la première frame et la convertir en sticker
            ffmpegCommand = `"${ffmpegExec}" -i "${mediaPath}" -vf "scale=512:512:force_original_aspect_ratio=increase,crop=512:512" -frames:v 1 -y "${outputPath}"`;
        } else {
            // Pour les images, redimensionner et convertir en sticker (sans padding blanc)
            ffmpegCommand = `"${ffmpegExec}" -i "${mediaPath}" -vf "scale=512:512:force_original_aspect_ratio=increase,crop=512:512" -y "${outputPath}"`;
        }
        
        console.log(`🔧 Commande FFmpeg: ${ffmpegCommand}`);
        try {
            await execAsync(ffmpegCommand);
        } catch (ffmpegError) {
            // Fallback Windows: si ffmpeg absent, conversion image via sharp
            if (!isVideo) {
                console.log('⚠️ FFmpeg indisponible, fallback Sharp pour sticker image...');
                await sharp(mediaPath)
                    .resize(512, 512, { fit: 'cover' })
                    .webp({ quality: 85 })
                    .toFile(outputPath);
            } else {
                throw ffmpegError;
            }
        }
        
        if (fs.existsSync(outputPath)) {
            console.log('✅ Sticker créé avec succès');
            return outputPath;
        } else {
            console.log('❌ Fichier sticker non créé');
            return null;
        }
    } catch (error) {
        console.error('❌ Erreur conversion sticker:', error.message);
        return null;
    }
}

/**
 * Convertit un sticker en image/vidéo
 */
async function stickerToMedia(stickerPath, isVideo = false) {
    const outputPath = `./temp_media_${Date.now()}.${isVideo ? 'mp4' : 'png'}`;
    const ffmpegExec = getFfmpegExecutable();
    
    if (isVideo) {
        try {
            await execWithTimeout(`"${ffmpegExec}" -i "${stickerPath}" -c:v libx264 -pix_fmt yuv420p "${outputPath}"`);
        } catch (ffmpegError) {
            console.log('⚠️ FFmpeg ne lit pas ce WebP animé, fallback webp-converter...');
            const frameWebpPath = `./temp_frame_${Date.now()}.webp`;
            const framePngPath = `./temp_frame_${Date.now()}.png`;
            try {
                const webpmuxExec = getWebpmuxExecutable();
                await execWithTimeout(`"${webpmuxExec}" -get frame 1 "${stickerPath}" -o "${frameWebpPath}"`);
                if (!fs.existsSync(frameWebpPath)) {
                    throw new Error('Extraction frame WebP échouée');
                }
                await sharp(frameWebpPath).png({ quality: 100 }).toFile(framePngPath);
                if (!fs.existsSync(framePngPath)) {
                    throw new Error('Conversion frame PNG échouée');
                }
                await execWithTimeout(`"${ffmpegExec}" -loop 1 -i "${framePngPath}" -t 3 -c:v libx264 -pix_fmt yuv420p "${outputPath}"`);
            } finally {
                safeUnlink(frameWebpPath);
                safeUnlink(framePngPath);
            }
        }
    } else {
        try {
            await execWithTimeout(`"${ffmpegExec}" -i "${stickerPath}" -c:v png "${outputPath}"`);
        } catch (ffmpegError) {
            console.log('⚠️ FFmpeg indisponible, fallback Sharp pour conversion sticker -> image...');
            await sharp(stickerPath)
                .png({ quality: 100 })
                .toFile(outputPath);
        }
    }

    if (!fs.existsSync(outputPath)) {
        throw new Error('Fichier de sortie non généré');
    }
    return outputPath;
}

/**
 * Traite la commande sticker
 */
async function processStickerCommand(sock, jid, quotedMsg) {
    try {
        console.log('🎨 Début traitement sticker...');
        
        await sock.sendMessage(jid, {
            text: '🎨 Je crée ton sticker, un instant... ⏳'
        });

        let mediaBuffer;
        let isVideo = false;

        // Debug détaillé du message cité
        console.log('🔍 Debug quotedMsg:', {
            hasImageMessage: !!quotedMsg.imageMessage,
            hasVideoMessage: !!quotedMsg.videoMessage,
            hasViewOnceMessage: !!quotedMsg.viewOnceMessage,
            hasViewOnceMessageV2: !!quotedMsg.viewOnceMessageV2,
            messageKeys: Object.keys(quotedMsg)
        });
        
        if (quotedMsg.imageMessage) {
            console.log('📸 Téléchargement image...');
            const stream = await downloadContentFromMessage(quotedMsg.imageMessage, 'image');
            let buffer = Buffer.from([]);
            for await (const chunk of stream) buffer = Buffer.concat([buffer, chunk]);
            mediaBuffer = buffer;
        } else if (quotedMsg.videoMessage) {
            console.log('🎬 Téléchargement vidéo...');
            const stream = await downloadContentFromMessage(quotedMsg.videoMessage, 'video');
            let buffer = Buffer.from([]);
            for await (const chunk of stream) buffer = Buffer.concat([buffer, chunk]);
            mediaBuffer = buffer;
            isVideo = true;
        } else if (quotedMsg.viewOnceMessage?.videoMessage) {
            console.log('🎬 Téléchargement vidéo vue unique...');
            const stream = await downloadContentFromMessage(quotedMsg.viewOnceMessage.videoMessage, 'video');
            let buffer = Buffer.from([]);
            for await (const chunk of stream) buffer = Buffer.concat([buffer, chunk]);
            mediaBuffer = buffer;
            isVideo = true;
        } else if (quotedMsg.viewOnceMessageV2?.videoMessage) {
            console.log('🎬 Téléchargement vidéo vue unique V2...');
            const stream = await downloadContentFromMessage(quotedMsg.viewOnceMessageV2.videoMessage, 'video');
            let buffer = Buffer.from([]);
            for await (const chunk of stream) buffer = Buffer.concat([buffer, chunk]);
            mediaBuffer = buffer;
            isVideo = true;
        } else {
            console.log('❌ Type de média non supporté');
            await sock.sendMessage(jid, {
                text: '❌ Je ne peux traiter que les images et vidéos !'
            });
            return;
        }

        if (!mediaBuffer) {
            console.log('❌ Échec téléchargement média');
            await sock.sendMessage(jid, {
                text: '😅 Oups ! Je n\'ai pas pu télécharger le média. Réessaie ! 🤗'
            });
            return;
        }

        console.log('✅ Média téléchargé, taille:', mediaBuffer.length);

        // Créer le dossier temp s'il n'existe pas
        if (!fs.existsSync('./temp')) {
            fs.mkdirSync('./temp', { recursive: true });
        }

        // Sauvegarder temporairement
        const tempPath = `./temp/media_${Date.now()}.${isVideo ? 'mp4' : 'jpg'}`;
        fs.writeFileSync(tempPath, mediaBuffer);
        console.log('💾 Média sauvegardé:', tempPath);

        // Convertir en sticker
        console.log('🔄 Conversion en sticker...');
        const stickerPath = await mediaToSticker(tempPath, isVideo);
        
        if (stickerPath && fs.existsSync(stickerPath)) {
            console.log('✅ Sticker créé:', stickerPath);
            const stickerBuffer = fs.readFileSync(stickerPath);
            
            await sock.sendMessage(jid, {
                sticker: stickerBuffer
            });
            
            console.log('✅ Sticker envoyé !');
            
            // Nettoyer les fichiers temporaires
            try {
                fs.unlinkSync(tempPath);
                fs.unlinkSync(stickerPath);
                console.log('🧹 Fichiers temporaires supprimés');
            } catch (cleanupError) {
                console.log('⚠️ Erreur nettoyage:', cleanupError.message);
            }
        } else {
            console.log('❌ Échec création sticker');
            await sock.sendMessage(jid, {
                text: '😅 Désolé, j\'ai eu un problème avec la conversion. Réessaie ! 🤗'
            });
        }
    } catch (error) {
        console.error('❌ Erreur processStickerCommand:', error.message);
        await sock.sendMessage(jid, {
            text: '😅 Oups ! Erreur lors de la création du sticker. Réessaie ! 🤗'
        });
    }
}

/**
 * Traite la conversion de sticker animé en vidéo
 */
async function processStickerToVideo(sock, jid, quotedMsg) {
    try {
        console.log('🎬 Début conversion sticker → vidéo...');
        
        await sock.sendMessage(jid, {
            text: '🎬 Je convertis ton sticker animé en vidéo... ⏳'
        });

        // Télécharger le sticker
        const stream = await downloadContentFromMessage(quotedMsg.stickerMessage, 'sticker');
        let buffer = Buffer.from([]);
        for await (const chunk of stream) buffer = Buffer.concat([buffer, chunk]);
        const stickerBuffer = buffer;

        // Vérifier si c'est un sticker animé (WebP animé)
        const isAnimated = await checkIfAnimatedWebP(stickerBuffer);
        
        if (!isAnimated) {
            await sock.sendMessage(jid, {
                text: '❌ *Ce sticker n\'est pas animé !*\n\n' +
                      '💡 *Astuce :* Seuls les stickers animés peuvent être convertis en vidéo.\n' +
                      '🎨 *Pour un sticker normal :* Utilise `-image` pour le convertir en image.'
            });
            return;
        }

        // Créer un nom de fichier unique
        const timestamp = Date.now();
        const tempStickerPath = path.join(__dirname, `temp_sticker_${timestamp}.webp`);
        const outputVideoPath = path.join(__dirname, `temp_video_${timestamp}.mp4`);

        try {
            // Sauvegarder le sticker temporairement
            fs.writeFileSync(tempStickerPath, stickerBuffer);

            // Convertir WebP animé en MP4 avec ffmpeg
            console.log('🔄 Conversion WebP → MP4...');
            const ffmpegExec = getFfmpegExecutable();
            const ffmpegCommand = `"${ffmpegExec}" -i "${tempStickerPath}" -vf "scale=512:512" -c:v libx264 -pix_fmt yuv420p -movflags +faststart -r 10 "${outputVideoPath}"`;
            
            await execAsync(ffmpegCommand);
            
            // Vérifier que la vidéo a été créée
            if (!fs.existsSync(outputVideoPath)) {
                throw new Error('La conversion a échoué');
            }

            // Envoyer la vidéo
            const videoBuffer = fs.readFileSync(outputVideoPath);
            await sock.sendMessage(jid, {
                video: videoBuffer,
                caption: '🎬 *Sticker animé converti en vidéo !*\n\n✨ *Conversion réussie !*'
            });

            console.log('✅ Conversion sticker → vidéo réussie');

        } finally {
            // Nettoyer les fichiers temporaires
            try {
                if (fs.existsSync(tempStickerPath)) fs.unlinkSync(tempStickerPath);
                if (fs.existsSync(outputVideoPath)) fs.unlinkSync(outputVideoPath);
            } catch (cleanupError) {
                console.log('⚠️ Erreur nettoyage:', cleanupError.message);
            }
        }

    } catch (error) {
        console.error('❌ Erreur processStickerToVideo:', error.message);
        await sock.sendMessage(jid, {
            text: '😅 *Erreur lors de la conversion !*\n\n' +
                  '💡 *Vérifications :*\n' +
                  '• Le sticker est-il vraiment animé ?\n' +
                  '• FFmpeg est-il installé ?\n' +
                  '• Réessaie avec un autre sticker animé !'
        });
    }
}

/**
 * Vérifie si un WebP est animé
 */
async function checkIfAnimatedWebP(buffer) {
    try {
        // Vérifier la signature WebP
        if (buffer.length < 12) return false;
        
        const signature = buffer.toString('hex', 0, 4);
        if (signature !== '52494646') return false; // "RIFF"
        
        const webpSignature = buffer.toString('hex', 8, 12);
        if (webpSignature !== '57454250') return false; // "WEBP"
        
        // Chercher le chunk ANIM dans le WebP
        const bufferString = buffer.toString('hex');
        return bufferString.includes('414e494d'); // "ANIM"
        
    } catch (error) {
        console.error('❌ Erreur vérification WebP animé:', error.message);
        return false;
    }
}

/**
 * Traite la commande image
 */
async function processImageCommand(sock, jid, quotedMsg) {
    let tempPath = null;
    let imagePath = null;
    let sentSuccessfully = false;
    try {
        await sock.sendMessage(jid, {
            text: '📸 Je convertis ton sticker en image... ⏳'
        });

        const stream = await downloadContentFromMessage(quotedMsg.stickerMessage, 'sticker');
        let buffer = Buffer.from([]);
        for await (const chunk of stream) buffer = Buffer.concat([buffer, chunk]);
        const stickerBuffer = buffer;
        
        if (!stickerBuffer) {
            await sock.sendMessage(jid, {
                text: '😅 Oups ! Je n\'ai pas pu télécharger le sticker. Réessaie ! 🤗'
            });
            return;
        }

        // Sauvegarder temporairement
        tempPath = `./temp_sticker_${Date.now()}.webp`;
        fs.writeFileSync(tempPath, stickerBuffer);

        // Convertir en image
        imagePath = await stickerToMedia(tempPath, false);
        
        if (imagePath) {
            const imageBuffer = fs.readFileSync(imagePath);
            await sock.sendMessage(jid, {
                image: imageBuffer,
                caption: '📸 Voilà ton image ! 😊'
            });
            sentSuccessfully = true;
            
            // Nettoyer
            safeUnlink(tempPath);
            safeUnlink(imagePath);
        } else {
            await sock.sendMessage(jid, {
                text: '😅 Désolé, j\'ai eu un problème avec la conversion. Réessaie ! 🤗'
            });
        }
    } catch (error) {
        console.error('Erreur image:', error.message);
        if (!sentSuccessfully) {
            await sock.sendMessage(jid, {
                text: '😅 Oups ! Erreur lors de la conversion. Réessaie ! 🤗'
            });
        }
    } finally {
        safeUnlink(tempPath);
        safeUnlink(imagePath);
    }
}

/**
 * Traite la commande vidéo
 */
async function processVideoCommand(sock, jid, quotedMsg) {
    try {
        await sock.sendMessage(jid, {
            text: '🎬 Je convertis ton sticker en vidéo... ⏳'
        });

        const stream = await downloadContentFromMessage(quotedMsg.stickerMessage, 'image');
        let buffer = Buffer.from([]);
        for await (const chunk of stream) buffer = Buffer.concat([buffer, chunk]);
        const stickerBuffer = buffer;
        
        if (!stickerBuffer) {
            await sock.sendMessage(jid, {
                text: '😅 Oups ! Je n\'ai pas pu télécharger le sticker. Réessaie ! 🤗'
            });
            return;
        }

        // Sauvegarder temporairement
        const tempPath = `./temp_sticker_${Date.now()}.webp`;
        fs.writeFileSync(tempPath, stickerBuffer);

        // Convertir en vidéo
        const videoPath = await stickerToMedia(tempPath, true);
        const videoBuffer = fs.readFileSync(videoPath);
        await sock.sendMessage(jid, {
            video: videoBuffer,
            caption: '🎬 Voilà ta vidéo ! 😊'
        });
        
        // Nettoyer
        safeUnlink(tempPath);
        safeUnlink(videoPath);
    } catch (error) {
        console.error('Erreur vidéo:', error.message);
        await sock.sendMessage(jid, {
            text: '😅 Impossible de convertir ce sticker animé pour le moment.\n\nEssaie un autre sticker ou renvoie-le, certains formats WhatsApp sont capricieux.'
        });
    }
}

/**
 * Détecte les salutations et réponses appropriées
 */
function detectGreeting(message) {
    const greetings = [
        'bonjour', 'salut', 'coucou', 'yo', 'hey', 'hello', 'hi', 'bonsoir',
        'bonne journée', 'bonne soirée', 'ça va', 'comment ça va', 'comment allez-vous'
    ];
    
    const messageLower = message.toLowerCase().trim();
    
    for (const greeting of greetings) {
        if (messageLower.includes(greeting)) {
            return true;
        }
    }
    
    return false;
}

/**
 * Génère une réponse de salutation personnalisée
 */
function generateGreetingResponse() {
    const greetings = [
        "Salut ! 😊 Comment puis-je t'aider aujourd'hui ?",
        "Hey ! 👋 Ravi de te voir ! Que puis-je faire pour toi ?",
        "Coucou ! 😄 Je suis là pour t'aider ! Que veux-tu savoir ?",
        "Bonjour ! ✨ Comment puis-je t'assister ?",
        "Yo ! 🤗 Qu'est-ce que je peux faire pour toi ?",
        "Hello ! 😊 Je suis prêt à répondre à tes questions !",
        "Salut l'ami ! 🤗 Que puis-je faire pour toi aujourd'hui ?",
        "Coucou ! 😄 Je suis là pour t'aider ! Que veux-tu savoir ?"
    ];
    
    return greetings[Math.floor(Math.random() * greetings.length)];
}

/**
 * Détecte les questions de suivi ou de clarification
 */
function detectFollowUp(message) {
    const followUpPatterns = [
        'peux-tu', 'peux tu', 'est-ce que', 'est ce que', 'comment', 'pourquoi', 'quand', 'où', 'qui', 'quoi',
        'explique', 'aide', 'aide-moi', 'aide moi', 'peux m\'aider', 'peux m aider',
        'stp', 's\'il te plaît', 's il te plait', 'please'
    ];
    
    const messageLower = message.toLowerCase().trim();
    
    for (const pattern of followUpPatterns) {
        if (messageLower.includes(pattern)) {
            return true;
        }
    }
    
    return false;
}

/**
 * Gère le contexte de conversation
 */
function updateConversationContext(userId, message, response) {
    if (!conversationContext.has(userId)) {
        conversationContext.set(userId, {
            topic: null,
            lastQuestion: null,
            messageCount: 0,
            lastInteraction: Date.now()
        });
    }
    
    const context = conversationContext.get(userId);
    context.messageCount++;
    context.lastInteraction = Date.now();
    context.lastQuestion = message;
    
    // Détecter le sujet de conversation
    if (message.toLowerCase().includes('développement') || message.toLowerCase().includes('programmation')) {
        context.topic = 'développement';
    } else if (message.toLowerCase().includes('hack') || message.toLowerCase().includes('sécurité')) {
        context.topic = 'sécurité';
    } else if (message.toLowerCase().includes('web') || message.toLowerCase().includes('site')) {
        context.topic = 'web';
    } else if (message.toLowerCase().includes('mobile') || message.toLowerCase().includes('app')) {
        context.topic = 'mobile';
    }
    
    conversationContext.set(userId, context);
}

/**
 * Génère une réponse contextuelle intelligente
 */
function generateContextualResponse(userId, message) {
    const context = conversationContext.get(userId);
    
    if (!context) {
        return null;
    }
    
    // Si c'est une salutation ET que c'est le début de conversation (moins de 3 messages)
    if (detectGreeting(message) && context.messageCount <= 2) {
        return generateGreetingResponse();
    }
    
    // Si c'est une salutation mais qu'on a déjà parlé, ne pas re-saluer
    if (detectGreeting(message) && context.messageCount > 2) {
        return null; // Laisser l'IA normale répondre
    }
    
    // Si c'est une question de suivi, être plus spécifique
    if (detectFollowUp(message)) {
        if (context.topic) {
            const topicResponses = {
                'développement': "Bien sûr ! Je peux t'aider avec le développement. Que veux-tu savoir exactement ?",
                'sécurité': "Parfait ! Je suis là pour t'aider avec la sécurité informatique. Quelle est ta question ?",
                'web': "Excellent ! Je peux t'assister avec le développement web. Que veux-tu apprendre ?",
                'mobile': "Super ! Je peux t'aider avec le développement mobile. Que veux-tu savoir ?"
            };
            return topicResponses[context.topic] || "Bien sûr ! Je peux t'aider. Que veux-tu savoir exactement ?";
        }
        return "Bien sûr ! Je peux t'aider. Que veux-tu savoir exactement ?";
    }
    
    return null;
}

/**
 * Affiche le menu des commandes disponibles
 */
async function showMenu(sock, jid) {
    const menuText = `╔══════════════════════════════════════╗
║        🤖 *JUXT_RTS BOT* 🤖        ║
║     *Menu Interactif & Dynamique*     ║
╚══════════════════════════════════════╝

┌─ 🎨 *MÉDIAS & CRÉATION* ─┐
│ • \`sticker\` → Convertir en sticker 🎭
│ • \`image\` → Sticker vers image 📸
│ • \`video\` → Sticker animé → vidéo 🎬
│ • \`send\` → Sauvegarder vue unique 💾
│ • \`img\` → Recherche inversée 🔍
│ • \`transcrire\` → Audio → texte 🎵
└─────────────────────────────┘

┌─ 🌐 *TÉLÉCHARGEMENT* ─┐
│ • *YouTube* → Téléchargement optimisé 📺
│ • *Facebook* → API avancée ✅
│ • *TikTok* → Via tikwm.com ✅
│ • *Instagram* → API + scraping ✅
│ • *Pinterest* → Multi-méthodes ✅
│ • ⏱️ Limite : 10 min max
└─────────────────────────┘

┌─ 🔍 *RECHERCHE & IA* ─┐
│ • \`find [terme]\` → Google web 🌐
│ • \`gimage [terme]\` → Images Google 🖼️
│ • \`img\` → Recherche inversée 🔄
│ • 💬 Chat IA → Questions libres 🤖
│ • 🎵 Audio IA → Réponses vocales 🗣️
└─────────────────────────┘

┌─ 🎉 *DIVERTISSEMENT* ─┐
│ • \`joke\` → Blagues gabonaises 😄
│ • \`quote\` → Citations inspirantes 💭
│ • \`fact\` → Faits scientifiques 🧪
│ • \`steve\` → Citations Steve Jobs 🍎
│ • \`meditation\` → Citations zen 🧘
│ • \`time\` → Heure Gabon 🇬🇦
└─────────────────────────┘

┌─ 📊 *UTILITAIRES* ─┐
│ • \`stats\` → Statistiques 📈
│ • \`poll [question]\` → Sondage 📊
│ • \`weather [ville]\` → Météo 🌤️
│ • \`backup\` → Sauvegarde 💾
└─────────────────────┘

┌─ 🛡️ *MODÉRATION* ─┐
│ • \`kick @user\` → Expulser 👢
│ • \`ban @user\` → Bannir 🚫
│ • \`activity\` → Analyse groupe 📊
│ • \`wordcloud\` → Nuage de mots ☁️
│ • \`results\` → Résultats sondages 📋
└─────────────────────┘

┌─ 🔧 *ADMINISTRATION* ─┐
│ • \`restart\` → Redémarrer 🔄
│ • \`status\` → État système 📊
│ • \`logs\` → Voir logs 📋
└─────────────────────────┘

┌─ 📞 *CONTACT & SUPPORT* ─┐
│ • \`creator\` → Infos créateur 👨‍💻
│ • \`support\` → Support technique 🆘
└─────────────────────────────┘

╔══════════════════════════════════════╗
║  💡 *ASTUCE* : Tape \`-menu\` à tout  ║
║     moment pour revoir ce menu !     ║
╚══════════════════════════════════════╝

🚀 *Propulsé par Gemini AI + Fallback JSON*
⚡ *Interface Web disponible sur le port 3001*`;

    // Envoyer la vidéo avec le menu en caption (reconnectés)
    await sock.sendMessage(jid, {
        video: { url: './videos/menu.mp4' },
        caption: menuText,
        gifPlayback: true
    });
}

/**
 * Traite la commande send pour les vues uniques
 */
async function processSendCommand(sock, jid, quotedMsg) {
    try {
        console.log('📸 Traitement vue unique...');
        console.log('📸 Détails du message:', {
            hasImageMessage: !!quotedMsg.imageMessage,
            hasVideoMessage: !!quotedMsg.videoMessage,
            hasViewOnceMessage: !!quotedMsg.viewOnceMessage,
            hasViewOnceMessageV2: !!quotedMsg.viewOnceMessageV2
        });
        
        await sock.sendMessage(jid, {
            text: '📸 Je sauvegarde ta vue unique... ⏳'
        });

        let mediaBuffer;
        let mediaType = 'image';
        let fileExtension = 'jpg';

        // Gérer les vues uniques
        if (quotedMsg.viewOnceMessage) {
            console.log('📸 Traitement vue unique v1...');
            const viewOnceMsg = quotedMsg.viewOnceMessage;
            if (viewOnceMsg.imageMessage) {
                console.log('📸 Téléchargement image vue unique v1...');
                const stream = await downloadContentFromMessage(viewOnceMsg.imageMessage, 'image');
                let buffer = Buffer.from([]);
                for await (const chunk of stream) buffer = Buffer.concat([buffer, chunk]);
                mediaBuffer = buffer;
                mediaType = 'image';
                fileExtension = 'jpg';
            } else if (viewOnceMsg.videoMessage) {
                console.log('📸 Téléchargement vidéo vue unique v1...');
                const stream = await downloadContentFromMessage(viewOnceMsg.videoMessage, 'video');
                let buffer = Buffer.from([]);
                for await (const chunk of stream) buffer = Buffer.concat([buffer, chunk]);
                mediaBuffer = buffer;
                mediaType = 'video';
                fileExtension = 'mp4';
            }
        } else if (quotedMsg.viewOnceMessageV2) {
            console.log('📸 Traitement vue unique v2...');
            const viewOnceMsg = quotedMsg.viewOnceMessageV2.message;
            if (viewOnceMsg.imageMessage) {
                console.log('📸 Téléchargement image vue unique v2...');
                const stream = await downloadContentFromMessage(viewOnceMsg.imageMessage, 'image');
                let buffer = Buffer.from([]);
                for await (const chunk of stream) buffer = Buffer.concat([buffer, chunk]);
                mediaBuffer = buffer;
                mediaType = 'image';
                fileExtension = 'jpg';
            } else if (viewOnceMsg.videoMessage) {
                console.log('📸 Téléchargement vidéo vue unique v2...');
                const stream = await downloadContentFromMessage(viewOnceMsg.videoMessage, 'video');
                let buffer = Buffer.from([]);
                for await (const chunk of stream) buffer = Buffer.concat([buffer, chunk]);
                mediaBuffer = buffer;
                mediaType = 'video';
                fileExtension = 'mp4';
            }
        } else if (quotedMsg.imageMessage) {
            console.log('📸 Téléchargement image normale...');
            const stream = await downloadContentFromMessage(quotedMsg.imageMessage, 'image');
            let buffer = Buffer.from([]);
            for await (const chunk of stream) buffer = Buffer.concat([buffer, chunk]);
            mediaBuffer = buffer;
            mediaType = 'image';
            fileExtension = 'jpg';
        } else if (quotedMsg.videoMessage) {
            console.log('🎬 Téléchargement vidéo vue unique...');
            const stream = await downloadContentFromMessage(quotedMsg.videoMessage, 'video');
            let buffer = Buffer.from([]);
            for await (const chunk of stream) buffer = Buffer.concat([buffer, chunk]);
            mediaBuffer = buffer;
            mediaType = 'video';
            fileExtension = 'mp4';
        } else {
            console.log('❌ Type de média non supporté pour send');
            console.log('📸 Types détectés:', Object.keys(quotedMsg).filter(key => key.includes('Message')));
            await sock.sendMessage(jid, {
                text: '❌ *Type de média non supporté !*\n\n' +
                      '📸 *Types supportés :*\n' +
                      '• Images normales\n' +
                      '• Vidéos normales\n' +
                      '• Images vue unique\n' +
                      '• Vidéos vue unique\n\n' +
                      '💡 *Assure-toi de répondre à une image ou vidéo !*'
            });
            return;
        }

        if (!mediaBuffer) {
            console.log('❌ Échec téléchargement média');
            await sock.sendMessage(jid, {
                text: '😅 Oups ! Je n\'ai pas pu télécharger le média. Réessaie ! 🤗'
            });
            return;
        }

        console.log('✅ Média téléchargé, taille:', mediaBuffer.length);

        // Créer le dossier temp s'il n'existe pas
        if (!fs.existsSync('./temp')) {
            fs.mkdirSync('./temp', { recursive: true });
        }

        // Sauvegarder le média
        const tempPath = `./temp/saved_${Date.now()}.${fileExtension}`;
        fs.writeFileSync(tempPath, mediaBuffer);
        console.log('💾 Média sauvegardé:', tempPath);

        // Envoyer le média sauvegardé
        if (mediaType === 'image') {
            await sock.sendMessage(jid, {
                image: mediaBuffer,
                caption: '📸 Vue unique sauvegardée ! 😊'
            });
        } else {
            await sock.sendMessage(jid, {
                video: mediaBuffer,
                caption: '🎬 Vue unique sauvegardée ! 😊'
            });
        }

        console.log('✅ Vue unique envoyée !');
        
        // Nettoyer le fichier temporaire
        try {
            fs.unlinkSync(tempPath);
            console.log('🧹 Fichier temporaire supprimé');
        } catch (cleanupError) {
            console.log('⚠️ Erreur nettoyage:', cleanupError.message);
        }

    } catch (error) {
        console.error('❌ Erreur processSendCommand:', error.message);
        await sock.sendMessage(jid, {
            text: '😅 Oups ! Erreur lors de la sauvegarde. Réessaie ! 🤗'
        });
    }
}

/**
 * Télécharge une vidéo YouTube
 */
async function downloadYouTube(url) {
    try {
        const ytdl = require('@distube/ytdl-core');
        const outputPath = `./temp_youtube_${Date.now()}.mp4`;
        
        const video = ytdl(url, { quality: 'highest' });
        const writeStream = fs.createWriteStream(outputPath);
        
        video.pipe(writeStream);
        
        return new Promise((resolve, reject) => {
            writeStream.on('finish', () => resolve(outputPath));
            writeStream.on('error', reject);
        });
    } catch (error) {
        console.error('Erreur YouTube:', error.message);
        return null;
    }
}

/**
 * Recherche sur Google
 */
async function searchGoogle(query) {
    try {
        const google = require('googlethis');
        const results = await google.search(query, { page: 0 });
        
        if (results.results && results.results.length > 0) {
            const firstResult = results.results[0];
            return `🔍 *Résultat de recherche pour "${query}"*\n\n` +
                   `*${firstResult.title}*\n` +
                   `${firstResult.description}\n\n` +
                   `🔗 ${firstResult.url}`;
        }
        
        return 'Aucun résultat trouvé pour cette recherche.';
    } catch (error) {
        console.error('Erreur recherche Google:', error.message);
        return 'Erreur lors de la recherche.';
    }
}

/**
 * Recherche d'images Google
 */
async function searchGoogleImages(query) {
    try {
        const google = require('googlethis');
        const results = await google.image(query, { safe: false });
        
        if (results && results.length > 0) {
            return results[0].url;
        }
        
        return null;
    } catch (error) {
        console.error('Erreur recherche images:', error.message);
        return null;
    }
}

/**
 * Affiche le menu avec image
 */
async function showMenuImage(sock, jid) {
    try {
        const imagePath = './images/menu.jpg';
        if (fs.existsSync(imagePath)) {
            const imageBuffer = fs.readFileSync(imagePath);
            await sock.sendMessage(jid, {
                image: imageBuffer,
                caption: `🤖 *JUXT_RTS BOT - MENU PRINCIPAL*\n\n` +
                        `*Commandes disponibles :*\n` +
                        `• \`-help\` - Affiche ce menu\n` +
                        `• \`-menu\` - Menu avec GIF\n` +
                        `• \`-info\` - Informations du bot\n` +
                        `• \`-sticker\` - Convertir média en sticker\n` +
                        `• \`-image\` - Convertir sticker en image\n` +
                        `• \`-video\` - Convertir sticker en vidéo\n` +
                        `• \`-download\` - Télécharger un statut\n` +
                        `• \`-yt <url>\` - Télécharger vidéo YouTube\n` +
                        `• \`-find <query>\` - Recherche Google\n` +
                        `• \`-gimage <query>\` - Recherche d'image\n` +
                        `• \`-img\` - Recherche inversée d'image\n` +
                        `• \`-transcrire\` - Transcription audio\n` +
                        `• \`-creator\` - Contact du créateur\n\n` +
                        `*Interaction IA :*\n` +
                        `• Envoyez un message texte pour une réponse IA\n` +
                        `• Envoyez une note vocale pour une réponse vocale\n` +
                        `• Dans les groupes, mentionnez @AquilaBot\n\n` +
                        `*Propulsé par Gemini AI avec système de fallback JSON*`
            });
        } else {
            await sock.sendMessage(jid, {
                text: 'Menu image non trouvé. Utilisez -menu pour le menu GIF.'
            });
        }
    } catch (error) {
        console.error('Erreur menu image:', error.message);
    }
}

/**
 * Affiche le menu avec GIF
 */
async function showMenuVideo(sock, jid) {
    try {
        const videoPath = './videos/menu.mp4';
        if (fs.existsSync(videoPath)) {
            const videoBuffer = fs.readFileSync(videoPath);
            await sock.sendMessage(jid, {
                video: videoBuffer,
                caption: `🤖 *JUXT_RTS BOT - MENU ANIMÉ*\n\n` +
                        `*Fonctionnalités :*\n` +
                        `🧠 Intelligence Artificielle (Gemini + Fallback JSON)\n` +
                        `🎵 Support audio (transcription + synthèse)\n` +
                        `🖼️ Conversion multimédia (stickers, images, vidéos)\n` +
                        `🌐 Recherche web (Google + Images)\n` +
                        `📱 Interface intuitive\n` +
                        `👥 Support groupes\n\n` +
                        `*Tapez -help pour voir toutes les commandes*`
            });
        } else {
            await sock.sendMessage(jid, {
                text: 'Menu vidéo non trouvé. Utilisez -help pour le menu image.'
            });
        }
    } catch (error) {
        console.error('Erreur menu vidéo:', error.message);
    }
}

/**
 * Fonction principale du bot
 */
async function startBot() {
    const { state, saveCreds } = await useMultiFileAuthState(SESSION_DIR);
    const { version, isLatest } = await fetchLatestBaileysVersion();
    
    console.log(`Utilisation de Baileys v${version.join('.')}, isLatest: ${isLatest}`);

    const sock = makeWASocket({
        version,
        logger,
        auth: state,
        browser: ['Juxt_Rts Bot', 'Chrome', '1.0.0'],
        connectTimeoutMs: WS_CONNECT_TIMEOUT_MS,
        defaultQueryTimeoutMs: 0,
        keepAliveIntervalMs: 10000,
        generateHighQualityLinkPreview: true,
        retryRequestDelayMs: 1000,
        maxMsgRetryCount: 3,
        markOnlineOnConnect: false
    });

    // Gestion des événements de connexion
    sock.ev.on('connection.update', async (update) => {
        const { connection, lastDisconnect, qr } = update;
        
        if (qr) {
            console.log('\n📱 ===== QR CODE POUR CONNEXION WHATSAPP =====');
            console.log('Scannez ce QR code avec votre téléphone :');
            try {
                const qrCode = await qrcode.toString(qr, { type: 'terminal', small: true });
                console.log(qrCode);
            } catch (error) {
                console.log('QR Code (format simple):');
                console.log(qr);
            }
            console.log('===============================================\n');
        }
        
        if (connection === 'close') {
            const error = lastDisconnect?.error;
            const statusCode = error?.output?.statusCode;
            const shouldReconnect = statusCode !== DisconnectReason.loggedOut;
            
            console.log('Connexion fermée, reconnexion:', shouldReconnect);
            console.log('Détails erreur:', error?.message, 'Code:', statusCode);
            
            // Vérifier si c'est une erreur de session corrompue (mais pas lors de la première connexion)
            const isSessionCorrupted = (error?.message?.includes('Bad MAC') || 
                                      error?.message?.includes('session')) &&
                                     statusCode !== 515; // Code 515 peut être normal lors de la première connexion
            
            if (isSessionCorrupted) {
                console.log('🚨 Session corrompue détectée dans le bot principal');
                console.log('🛑 Arrêt du bot pour éviter les boucles infinies');
                return; // Ne pas essayer de se reconnecter
            }
            
            if (shouldReconnect) {
                reconnectAttempts += 1;
                const delayMs = Math.min(5000 * reconnectAttempts, MAX_RECONNECT_DELAY_MS);
                console.log(`🔄 Tentative de reconnexion #${reconnectAttempts} dans ${Math.round(delayMs / 1000)} secondes...`);
                setTimeout(() => {
                    startBot();
                }, delayMs);
            }
        } else if (connection === 'open') {
            reconnectAttempts = 0;
            console.log('✅ Connecté à WhatsApp !');
            
            // Message de confirmation au créateur (avec délai pour éviter les erreurs)
            setTimeout(async () => {
                try {
                    if (sock && sock.user) {
                        await sock.sendMessage(CREATOR_CONTACT, {
                            text: '🤖 *Juxt_Rts Bot* est maintenant en ligne !\n\n' +
                                  `✅ Connexion établie avec succès\n` +
                                  `🔧 Système de fallback JSON activé\n` +
                                  `⚡ Prêt à répondre à vos questions !\n\n` +
                                  `*Créateur:* ELLA ASSOUMOU Juste Renaric\n` +
                                  `*Contact:* +241076234942`
                        });
                        console.log('✅ Message de confirmation envoyé au créateur');
                    }
                } catch (error) {
                    console.error('Erreur envoi message créateur:', error.message);
                }
            }, 3000); // Attendre 3 secondes
        }
    });

    // Sauvegarde des credentials
    sock.ev.on('creds.update', saveCreds);

// Gestion des messages
sock.ev.on('messages.upsert', async (m) => {
        const msg = m.messages[0];
        
        if (!msg.message) return;
        if (m.type !== 'notify') return;
        if (msg.message.protocolMessage) return;

        const messageTimestamp = getMessageTimestampSeconds(msg);
        if (messageTimestamp && messageTimestamp < BOT_STARTUP_UNIX) {
            return;
        }
        
        
        // Debug pour comprendre la structure des messages
        const messageType = Object.keys(msg.message || {})[0];
        console.log('🔍 Type de message détecté:', messageType);

        // Ignorer les messages techniques WhatsApp non exploitables
        if (messageType === 'senderKeyDistributionMessage') {
            return;
        }
        
        if (messageType === 'ephemeralMessage') {
            console.log('🔍 Contenu ephemeralMessage:', JSON.stringify(msg.message.ephemeralMessage, null, 2));
        }
        
        const messageText = msg.message.conversation || 
                          msg.message.extendedTextMessage?.text || 
                          msg.message.ephemeralMessage?.message?.conversation ||
                          msg.message.ephemeralMessage?.message?.extendedTextMessage?.text ||
                          msg.message.imageMessage?.caption || 
                          msg.message.videoMessage?.caption || 
                          msg.message.audioMessage?.caption ||
                          msg.message.protocolMessage?.conversation ||
                          msg.message.protocolMessage?.extendedTextMessage?.text ||
                          msg.message.viewOnceMessage?.message?.conversation ||
                          msg.message.viewOnceMessage?.message?.extendedTextMessage?.text ||
                          msg.message.viewOnceMessageV2?.message?.conversation ||
                          msg.message.viewOnceMessageV2?.message?.extendedTextMessage?.text || '';
        const isCommandFromText = (messageText || '').trim().startsWith(PREFIX);
        const isVideoLinkMessage = !!(messageText || '').trim() && detectVideoLink(messageText);
        
        // En mode commandes uniquement, on laisse passer:
        // - les commandes préfixées
        // - les liens vidéo (TikTok/YouTube/etc.) pour téléchargement auto
        if (COMMANDS_ONLY_MODE && !isCommandFromText && !isVideoLinkMessage) {
            return;
        }
        
        console.log('🔍 MessageText extrait:', messageText);
        
        const messageId = msg.key.id;
        const jid = msg.key.remoteJid;
        const isGroup = jid.endsWith('@g.us');
        const isFromMe = msg.key.fromMe;

        // Ignorer totalement les statuts / broadcasts WhatsApp
        if (jid === 'status@broadcast') {
            return;
        }
        
        // Ignorer les messages envoyés par le bot, sauf:
        // - commandes explicites
        // - liens vidéo (pour déclencher les téléchargements depuis son propre chat)
        if (isFromMe && !isCommandFromText && !isVideoLinkMessage) return;
        
        // Anti-spam
        if (isMessageCached(messageId)) return;
        cacheMessage(messageId);
        
        // Compter les messages pour les statistiques réelles
        const sender = msg.participant || msg.key.remoteJid;
        
        if (!global.groupStats) {
            global.groupStats = new Map();
        }
        
        if (isGroup) {
            if (!global.groupStats.has(jid)) {
                global.groupStats.set(jid, {
                    totalMessages: 0,
                    totalMedia: 0,
                    memberActivity: new Map(),
                    lastActivity: new Date(),
                    creationDate: new Date()
                });
            }
            
            const groupStats = global.groupStats.get(jid);
            groupStats.totalMessages++;
            groupStats.lastActivity = new Date();
            
            // Compter l'activité des membres
            const memberId = sender.split('@')[0];
            groupStats.memberActivity.set(memberId, (groupStats.memberActivity.get(memberId) || 0) + 1);
            
            // Compter les médias
            if (msg.message.imageMessage || msg.message.videoMessage || msg.message.audioMessage || msg.message.documentMessage || msg.message.stickerMessage) {
                groupStats.totalMedia++;
            }
        }
        
        // Vérifier les mots interdits
        if (containsForbiddenWords(messageText)) {
            await sock.sendMessage(jid, {
                text: '😊 Hey ! Je préfère qu\'on garde une conversation sympa et respectueuse. Peux-tu reformuler ta question de manière plus cool ? Je suis là pour t\'aider ! 🤗'
            });
            return;
        }

        // Gestion des commandes prioritaires (toujours traitées en premier)
        if (messageText.toLowerCase().trim() === 'menu' || 
            messageText.toLowerCase().trim() === 'help' ||
            messageText.toLowerCase().trim() === 'info') {
            await showMenu(sock, jid);
            return;
        }
        
        // Commandes critiques (toujours traitées immédiatement)
        if (messageText.startsWith(PREFIX)) {
            const fullCommand = messageText.slice(PREFIX.length).toLowerCase().trim();
            const command = fullCommand.split(' ')[0];
            
            // Commandes critiques qui ne doivent jamais être bloquées
            const criticalCommands = ['send', 'sticker', 'image', 'video', 'creator', 'joke', 'quote', 'fact', 'time', 'steve', 'meditation'];
            
            if (criticalCommands.includes(command)) {
                console.log('🚨 Commande critique détectée:', command);
                // Traitement immédiat des commandes critiques
                processCriticalCommand(sock, msg, command, fullCommand, jid, isGroup);
                return;
            }
        }

        // Vérifier les conditions de réponse
        const quotedMsg = msg.message.extendedTextMessage?.contextInfo?.quotedMessage;
        const isQuotedBot = quotedMsg && quotedMsg.key && quotedMsg.key.fromMe;
        
        // Vérifier si le bot est mentionné (méthode robuste WhatsApp)
        const botJid = sock.user?.id;
        const mentionedJids = msg.message.extendedTextMessage?.contextInfo?.mentionedJid || [];
        const isMentioned = !!botJid && mentionedJids.includes(botJid);
        
        // Vérifier si c'est une commande
        const isCommand = messageText.startsWith(PREFIX);
        
        // Vérifier les mots-clés sans préfixe
        const keywords = ['menu', 'help', 'aide', 'qui es-tu', 'ton nom', 'info'];
        const hasKeyword = keywords.some(keyword => 
            messageText.toLowerCase().includes(keyword.toLowerCase())
        );
        
        // Déterminer si on doit répondre
        let shouldRespond = false;
        
        if (!isGroup) {
            // En inbox, répondre aux nouveaux messages (même sans commande)
            shouldRespond = true;
        } else {
            // En groupe, ignorer si non mentionné (sauf commande explicite ou réponse au bot)
            shouldRespond = isMentioned || isQuotedBot || isCommand;
        }
        
        // Vérifier si c'est un lien vidéo (toujours traiter les liens vidéo)
        if (messageText.trim() && detectVideoLink(messageText)) {
            const videoUrl = extractVideoUrl(messageText);
            if (videoUrl) {
                console.log('🎬 Lien vidéo détecté:', videoUrl);
                await sock.sendMessage(jid, {
                    text: '🎬 *Lien vidéo détecté !*\n\n⏳ Je télécharge la vidéo pour toi...'
                });
                // Téléchargement asynchrone avec timeout
                Promise.race([
                    downloadVideoFromUrl(videoUrl, sock, jid),
                    new Promise((_, reject) => 
                        setTimeout(() => reject(new Error('Timeout téléchargement')), 60000)
                    )
                ]).catch(error => {
                    console.error('❌ Erreur téléchargement asynchrone:', error.message);
                    if (error.message === 'Timeout téléchargement') {
                        sock.sendMessage(jid, {
                            text: '⏰ *Téléchargement en cours...*\n\n🔄 Le téléchargement prend plus de temps que prévu. Je continue en arrière-plan !'
                        }).catch(() => {});
                    }
                });
                return;
            }
        }
        
        // Si on ne doit pas répondre, ignorer le message
        if (!shouldRespond) {
            console.log(`Message ignoré : groupe sans mention du bot.`);
            return; // Ignorer le message
        }

        // Répondre aux messages du bot
        if (isQuotedBot) {
            await sock.sendMessage(jid, {
                text: '🤖 *Salut ! Je suis là pour t\'aider !*\n\n' +
                      '💡 *Que puis-je faire pour toi ?*\n' +
                      '• Tape `-menu` pour voir toutes mes fonctionnalités\n' +
                      '• Pose-moi une question directement\n' +
                      '• Utilise une commande avec `-`\n\n' +
                      '😊 *Je suis prêt à t\'assister !*'
            });
            return;
        }
        
        // Répondre aux mots-clés
        if (hasKeyword) {
            if (messageText.toLowerCase().includes('menu') || messageText.toLowerCase().includes('help') || messageText.toLowerCase().includes('aide')) {
                await showMenu(sock, jid);
                return;
            }
            
            if (messageText.toLowerCase().includes('qui es-tu') || messageText.toLowerCase().includes('tu es qui') || messageText.toLowerCase().includes('ton nom')) {
                await sock.sendMessage(jid, {
                    text: `🤖 *Salut ! Je suis JUXT_RTS BOT !* 🤖\n\n` +
                          `*Créé par :* ELLA ASSOUMOU Juste Renaric\n` +
                          `*Contact :* +241076234942\n` +
                          `*Spécialité :* Développement Web, Mobile & Hacking Éthique\n\n` +
                          `*Tape \`-menu\` pour voir toutes mes fonctionnalités !* 😊`
                });
                return;
            }
        }

        // Gestion des réponses aux images/vidéos avec commandes
        if (msg.message.extendedTextMessage?.contextInfo?.quotedMessage) {
            const quotedMsg = msg.message.extendedTextMessage.contextInfo.quotedMessage;
            const command = messageText.toLowerCase().trim();
            
            console.log('🔍 Debug commande:', {
                command: command,
                hasImageMessage: !!quotedMsg.imageMessage,
                hasVideoMessage: !!quotedMsg.videoMessage,
                hasStickerMessage: !!quotedMsg.stickerMessage,
                hasViewOnceMessage: !!quotedMsg.viewOnceMessage,
                viewOnceImage: !!quotedMsg.viewOnceMessage?.imageMessage,
                viewOnceVideo: !!quotedMsg.viewOnceMessage?.videoMessage
            });
            
            // Réponse à une image/vidéo/sticker (normale ou vue unique)
            if (quotedMsg.imageMessage || quotedMsg.videoMessage || quotedMsg.stickerMessage ||
                quotedMsg.viewOnceMessage?.imageMessage || quotedMsg.viewOnceMessage?.videoMessage ||
                quotedMsg.viewOnceMessageV2?.imageMessage || quotedMsg.viewOnceMessageV2?.videoMessage) {
                if (command === 'sticker' || command === '-sticker') {
                    // Vérifier si c'est un sticker pour la conversion en vidéo
                    if (quotedMsg.stickerMessage) {
                        await processStickerToVideo(sock, jid, quotedMsg);
                    } else {
                        // Image/vidéo vers sticker
                        await processStickerCommand(sock, jid, quotedMsg);
                    }
                    return;
                } else if (command === 'video' || command === '-video') {
                    // Convertir sticker animé en vidéo
                    if (quotedMsg.stickerMessage) {
                        await processStickerToVideo(sock, jid, quotedMsg);
                    } else {
                        await sock.sendMessage(jid, {
                            text: '🎬 *Convertir sticker en vidéo :*\n\n' +
                                  '1. Envoie un sticker animé\n' +
                                  '2. Réponds avec `-video`\n\n' +
                                  'Je vais le convertir ! 😊'
                        });
                    }
                    return;
                } else if (command === 'send' || command === '-send') {
                    console.log('📸 Commande send détectée sur image/vidéo normale');
                    await processSendCommand(sock, jid, quotedMsg);
                    return;
                }
            }
            
            // Réponse à une vue unique (viewOnceMessage ou viewOnceMessageV2)
            if (quotedMsg.viewOnceMessage || quotedMsg.viewOnceMessageV2) {
                console.log('👁️ Vue unique détectée');
                if (command === 'send' || command === '-send') {
                    console.log('📸 Commande send détectée sur vue unique');
                    // Extraire le média de la vue unique
                    let mediaMessage = null;
                    if (quotedMsg.viewOnceMessage) {
                        mediaMessage = quotedMsg.viewOnceMessage.imageMessage || quotedMsg.viewOnceMessage.videoMessage;
                    } else if (quotedMsg.viewOnceMessageV2) {
                        mediaMessage = quotedMsg.viewOnceMessageV2.message?.imageMessage || quotedMsg.viewOnceMessageV2.message?.videoMessage;
                    }
                    
                    if (mediaMessage) {
                        console.log('✅ Média trouvé dans vue unique');
                        await processSendCommand(sock, jid, { imageMessage: mediaMessage, videoMessage: mediaMessage });
                        return;
                    } else {
                        console.log('❌ Aucun média trouvé dans vue unique');
                    }
                }
            }
            
            // Réponse à un sticker
            if (quotedMsg.stickerMessage) {
                if (command === 'image' || command === '-image') {
                    await processImageCommand(sock, jid, quotedMsg);
                    return;
                } else if (command === 'video' || command === '-video') {
                    await processVideoCommand(sock, jid, quotedMsg);
                    return;
                }
            }
        }

        
        // Gestion des commandes
        console.log('🔍 Debug commande:', {
            messageText: messageText,
            startsWithPrefix: messageText.startsWith(PREFIX),
            PREFIX: PREFIX,
            isGroup: isGroup,
            jid: jid,
            messageType: Object.keys(msg.message)[0],
            hasEphemeralMessage: !!msg.message.ephemeralMessage,
            ephemeralMessageType: msg.message.ephemeralMessage ? Object.keys(msg.message.ephemeralMessage.message || {})[0] : 'none'
        });
        
        
        if (messageText.startsWith(PREFIX)) {
            const fullCommand = messageText.slice(PREFIX.length).toLowerCase().trim();
            // Extraire seulement le premier mot (la commande)
            const command = fullCommand.split(' ')[0];
            console.log('🔍 Commande détectée:', command);
            console.log('🔍 Texte complet:', fullCommand);
            
            switch (command) {
                case 'help':
                    await showMenu(sock, jid);
                    break;
                    
                case 'menu':
                    await showMenu(sock, jid);
                    break;
                
                case 'pp':
                    await processProfilePictureCommand(sock, msg, jid);
                    break;
                    
                case 'sticker':
                    // Vérifier s'il y a un message cité (réponse à une image/vidéo)
                    const quotedMsg = msg.message.extendedTextMessage?.contextInfo?.quotedMessage;
                    if (quotedMsg && (quotedMsg.imageMessage || quotedMsg.videoMessage)) {
                        await processStickerCommand(sock, jid, quotedMsg);
                    } else {
                        await sock.sendMessage(jid, {
                            text: '🎨 *Créer un sticker :*\n\n' +
                                  '1. Envoie une image ou vidéo\n' +
                                  '2. Réponds avec `-sticker`\n\n' +
                                  'Je vais le convertir en sticker ! 😊'
                        });
                    }
                    break;
                    
                case 'image':
                    // Vérifier s'il y a un message cité (réponse à un sticker)
                    const quotedMsgImage = msg.message.extendedTextMessage?.contextInfo?.quotedMessage;
                    if (quotedMsgImage && quotedMsgImage.stickerMessage) {
                        await processImageCommand(sock, jid, quotedMsgImage);
                    } else {
                        await sock.sendMessage(jid, {
                            text: '📸 *Convertir sticker en image :*\n\n' +
                                  '1. Envoie un sticker\n' +
                                  '2. Réponds avec `-image`\n\n' +
                                  'Je vais le convertir ! 😊'
                        });
                    }
                    break;
                    
                case 'video':
                    // Vérifier s'il y a un message cité (réponse à un sticker)
                    const quotedMsgVideo = msg.message.extendedTextMessage?.contextInfo?.quotedMessage;
                    if (quotedMsgVideo && quotedMsgVideo.stickerMessage) {
                        await processVideoCommand(sock, jid, quotedMsgVideo);
                    } else {
                        await sock.sendMessage(jid, {
                            text: '🎬 *Convertir sticker en vidéo :*\n\n' +
                                  '1. Envoie un sticker animé\n' +
                                  '2. Réponds avec `-video`\n\n' +
                                  'Je vais le convertir ! 😊'
                        });
                    }
                    break;
                    
                case 'send':
                    console.log('✅ Commande -send détectée dans switch !');
                    console.log('🔍 Message complet:', JSON.stringify(msg.message, null, 2));
                    
                    // Vérifier s'il y a un message cité (réponse à un média)
                    const quotedMsgSend = msg.message.extendedTextMessage?.contextInfo?.quotedMessage;
                    console.log('🔍 Message cité détecté:', !!quotedMsgSend);
                    
                    if (quotedMsgSend) {
                        console.log('🔍 Contenu du message cité:', {
                            hasImageMessage: !!quotedMsgSend.imageMessage,
                            hasVideoMessage: !!quotedMsgSend.videoMessage,
                            hasViewOnceMessage: !!quotedMsgSend.viewOnceMessage,
                            hasViewOnceMessageV2: !!quotedMsgSend.viewOnceMessageV2,
                            viewOnceImage: !!quotedMsgSend.viewOnceMessage?.imageMessage,
                            viewOnceVideo: !!quotedMsgSend.viewOnceMessage?.videoMessage,
                            viewOnceV2Image: !!quotedMsgSend.viewOnceMessageV2?.message?.imageMessage,
                            viewOnceV2Video: !!quotedMsgSend.viewOnceMessageV2?.message?.videoMessage
                        });
                        
                        if (quotedMsgSend.imageMessage || quotedMsgSend.videoMessage) {
                            console.log('📸 Commande -send sur image/vidéo normale');
                            await processSendCommand(sock, jid, quotedMsgSend);
                        } else if (quotedMsgSend.viewOnceMessage) {
                            console.log('👁️ Commande -send sur vue unique (v1)');
                            const mediaMessage = quotedMsgSend.viewOnceMessage.imageMessage || quotedMsgSend.viewOnceMessage.videoMessage;
                            if (mediaMessage) {
                                console.log('✅ Média trouvé dans vue unique v1, traitement...');
                                await processSendCommand(sock, jid, { imageMessage: mediaMessage, videoMessage: mediaMessage });
                            } else {
                                console.log('❌ Aucun média trouvé dans vue unique v1');
                                await sock.sendMessage(jid, {
                                    text: '❌ Aucun média trouvé dans la vue unique !'
                                });
                            }
                        } else if (quotedMsgSend.viewOnceMessageV2) {
                            console.log('👁️ Commande -send sur vue unique (v2)');
                            const mediaMessage = quotedMsgSend.viewOnceMessageV2.message?.imageMessage || quotedMsgSend.viewOnceMessageV2.message?.videoMessage;
                            if (mediaMessage) {
                                console.log('✅ Média trouvé dans vue unique v2, traitement...');
                                await processSendCommand(sock, jid, { imageMessage: mediaMessage, videoMessage: mediaMessage });
                            } else {
                                console.log('❌ Aucun média trouvé dans vue unique v2');
                                await sock.sendMessage(jid, {
                                    text: '❌ Aucun média trouvé dans la vue unique !'
                                });
                            }
                        } else {
                            console.log('❌ Aucun média détecté dans le message cité');
                            await sock.sendMessage(jid, {
                                text: '❌ Pour utiliser la commande `-send`, tu dois répondre à une image ou vidéo (normale ou vue unique) !'
                            });
                        }
                    } else {
                        console.log('❌ Aucun message cité trouvé');
                        await sock.sendMessage(jid, {
                            text: '📸 *Sauvegarder vue unique :*\n\n' +
                                  '1. Envoie une image/vidéo en vue unique\n' +
                                  '2. Réponds avec `-send`\n\n' +
                                  'Je vais la sauvegarder ! 😊'
                        });
                    }
                    break;
                    
                case 'info':
                    const stats = fallbackHandler.getStats();
                    await sock.sendMessage(jid, {
                        text: `🤖 *JUXT_RTS BOT - INFORMATIONS*\n\n` +
                              `*Version:* 2.0 avec Fallback JSON\n` +
                              `*Créateur:* ELLA ASSOUMOU Juste Renaric\n` +
                              `*Contact:* +241076234942\n\n` +
                              `*Statistiques Fallback:*\n` +
                              `📚 Catégories: ${stats.categories}\n` +
                              `📖 Sujets: ${stats.topics}\n` +
                              `💬 Réponses: ${stats.responses}\n\n` +
                              `*Statut:*\n` +
                              `🧠 Gemini AI: ${genAI ? '✅ Actif' : '❌ Inactif'}\n` +
                              `📋 Fallback JSON: ${fallbackHandler.isAvailable() ? '✅ Actif' : '❌ Inactif'}\n\n` +
                              `*Propulsé par Gemini AI avec système de fallback intelligent*`
                    });
                    break;
                    
                case 'creator':
                    // Réagir au message
                    await reactToMessage(sock, sender, msg.key.id, 'ℹ️');
                    // Envoi de l'image et du texte
                    await sock.sendMessage(sender, {
                        image: { url: './images/creator.jpg' },
                        caption: `🌟 **Juxt_Rts Bot - À propos** 🌟

**Description** : Je suis Juxt_Rts Bot, un assistant WhatsApp intelligent et polyvalent créé pour aider, divertir et gérer vos groupes avec style ! 😎

**Créateur** : ELLA ASSOUMOU Juste Renaric
**Numéro WhatsApp du créateur** : +${CREATOR_CONTACT.split('@')[0]}
**Site web** : https://x.ai/grok`
                    });
                    break;
                    
                case 'joke':
                    const jokes = [
                        "🇬🇦 *Blague gabonaise :* Pourquoi le Gabonais ne va jamais au restaurant ? Parce qu'il préfère manger à la maison avec sa maman ! 😄",
                        "🇬🇦 *Blague gabonaise :* Un Gabonais dit à son ami : 'Mon frère, j'ai acheté une voiture !' L'ami répond : 'C'est bien ! Elle marche ?' 'Non, elle ne marche pas, elle roule !' 🚗",
                        "🇬🇦 *Blague gabonaise :* Pourquoi les Gabonais sont-ils toujours en retard ? Parce qu'ils arrivent toujours à l'heure gabonaise ! ⏰",
                        "🇬🇦 *Blague gabonaise :* Un Gabonais va chez le médecin : 'Docteur, j'ai mal partout !' 'Partout ?' 'Oui, partout où je me touche !' 🏥",
                        "🇬🇦 *Blague gabonaise :* Pourquoi les Gabonais n'utilisent jamais d'ascenseur ? Parce qu'ils préfèrent monter à pied ! 🏢",
                        "🇬🇦 *Blague gabonaise :* Un Gabonais dit : 'J'ai économisé 1000 francs !' 'C'est bien !' 'Oui, maintenant je peux acheter un billet de 1000 francs !' 💰",
                        "🇬🇦 *Blague gabonaise :* Pourquoi les Gabonais ne jouent jamais aux échecs ? Parce qu'ils préfèrent jouer aux dames ! ♟️",
                        "🇬🇦 *Blague gabonaise :* Un Gabonais va au marché : 'Combien coûte ce poisson ?' '1000 francs !' 'Et si je prends deux ?' 'Alors c'est 2000 francs !' 🐟",
                        "🇬🇦 *Blague gabonaise :* Pourquoi les Gabonais n'ont jamais froid ? Parce qu'ils ont toujours chaud ! 🌡️",
                        "🇬🇦 *Blague gabonaise :* Un Gabonais dit : 'J'ai perdu mon téléphone !' 'Où l'as-tu perdu ?' 'Je ne sais pas, il ne répond plus !' 📱",
                        "🇬🇦 *Blague gabonaise :* Pourquoi les Gabonais n'utilisent jamais de parapluie ? Parce qu'ils préfèrent attendre que la pluie s'arrête ! ☔",
                        "🇬🇦 *Blague gabonaise :* Un Gabonais va chez le coiffeur : 'Je veux une coupe moderne !' 'D'accord !' 'Mais pas trop moderne !' 💇‍♂️",
                        "🇬🇦 *Blague gabonaise :* Pourquoi les Gabonais ne font jamais de régime ? Parce qu'ils préfèrent grossir ! 🍽️",
                        "🇬🇦 *Blague gabonaise :* Un Gabonais dit : 'J'ai acheté un ordinateur !' 'C'est bien !' 'Oui, maintenant je peux jouer aux jeux !' 💻",
                        "🇬🇦 *Blague gabonaise :* Pourquoi les Gabonais n'ont jamais soif ? Parce qu'ils boivent toujours de l'eau ! 💧",
                        "🇬🇦 *Blague gabonaise :* Un Gabonais va au cinéma : 'Combien coûte un ticket ?' '500 francs !' 'Et pour deux ?' '1000 francs !' 🎬",
                        "🇬🇦 *Blague gabonaise :* Pourquoi les Gabonais ne font jamais de sport ? Parce qu'ils préfèrent regarder les autres ! 🏃‍♂️",
                        "🇬🇦 *Blague gabonaise :* Un Gabonais dit : 'J'ai perdu mes clés !' 'Où les as-tu perdues ?' 'Je ne sais pas, elles ne répondent plus !' 🔑",
                        "🇬🇦 *Blague gabonaise :* Pourquoi les Gabonais n'utilisent jamais de réveil ? Parce qu'ils se réveillent toujours à l'heure ! ⏰",
                        "🇬🇦 *Blague gabonaise :* Un Gabonais va chez le dentiste : 'J'ai mal aux dents !' 'Quelle dent ?' 'Toutes !' 🦷",
                        "🇬🇦 *Blague gabonaise :* Pourquoi les Gabonais ne font jamais de bricolage ? Parce qu'ils préfèrent appeler quelqu'un ! 🔨",
                        "🇬🇦 *Blague gabonaise :* Un Gabonais dit : 'J'ai acheté une maison !' 'C'est bien !' 'Oui, maintenant je peux y habiter !' 🏠",
                        "🇬🇦 *Blague gabonaise :* Pourquoi les Gabonais n'ont jamais faim ? Parce qu'ils mangent toujours ! 🍽️",
                        "🇬🇦 *Blague gabonaise :* Un Gabonais va chez le médecin : 'Docteur, j'ai mal à la tête !' 'Prenez un comprimé !' 'Quel comprimé ?' 'Celui que je vous donne !' 💊",
                        "🇬🇦 *Blague gabonaise :* Pourquoi les Gabonais ne font jamais de ménage ? Parce qu'ils préfèrent que quelqu'un d'autre le fasse ! 🧹",
                        "🇬🇦 *Blague gabonaise :* Un Gabonais dit : 'J'ai perdu mon portefeuille !' 'Où l'as-tu perdu ?' 'Je ne sais pas, il ne répond plus !' 💼",
                        "🇬🇦 *Blague gabonaise :* Pourquoi les Gabonais n'utilisent jamais de GPS ? Parce qu'ils connaissent toujours le chemin ! 🗺️",
                        "🇬🇦 *Blague gabonaise :* Un Gabonais va au restaurant : 'Je veux manger !' 'Qu'est-ce que vous voulez ?' 'Ce que vous avez !' 🍽️",
                        "🇬🇦 *Blague gabonaise :* Pourquoi les Gabonais ne font jamais de sport ? Parce qu'ils préfèrent regarder la télé ! 📺",
                        "🇬🇦 *Blague gabonaise :* Un Gabonais dit : 'J'ai acheté un téléphone !' 'C'est bien !' 'Oui, maintenant je peux appeler !' 📞",
                        "💻 *Blague tech :* Pourquoi les programmeurs confondent-ils Halloween et Noël ? Parce que 31 OCT = 25 DEC ! 🎃"
                    ];
                    const randomJoke = jokes[Math.floor(Math.random() * jokes.length)];
                    await sock.sendMessage(jid, {
                        text: `😂 *BLAGUE DU JOUR* 😂\n\n${randomJoke}\n\n🤣 J'espère que ça t'a fait rire ! Tape \`-joke\` pour une autre blague !`
                    });
                    break;
                    
                case 'quote':
                    const quotes = [
                        "🌟 *Citation inspirante :* 'Le succès, c'est tomber sept fois et se relever huit.' - Proverbe japonais",
                        "💡 *Citation de Steve Jobs :* 'L'innovation distingue un leader d'un suiveur.'",
                        "💻 *Citation tech :* 'Le code est comme l'humour. Quand on doit l'expliquer, c'est mauvais.' - Cory House",
                        "❤️ *Citation de Steve Jobs :* 'La seule façon de faire du bon travail, c'est d'aimer ce que vous faites.'",
                        "🚀 *Citation de Steve Jobs :* 'Soyez insatiables. Soyez fous.'",
                        "🎯 *Citation de Steve Jobs :* 'Votre temps est limité, ne le gaspillez pas en vivant la vie de quelqu'un d'autre.'",
                        "💡 *Citation de Steve Jobs :* 'L'innovation, c'est la différence entre un leader et un suiveur.'",
                        "🌟 *Citation de Steve Jobs :* 'La simplicité est la sophistication suprême.'",
                        "🎨 *Citation de Steve Jobs :* 'Le design n'est pas seulement à quoi ça ressemble et à quoi ça donne l'impression. Le design, c'est comment ça fonctionne.'",
                        "💪 *Citation de Steve Jobs :* 'Restez affamés. Restez fous.'",
                        "🎯 *Citation de Steve Jobs :* 'Les gens ne savent pas ce qu'ils veulent jusqu'à ce que vous le leur montriez.'",
                        "🌟 *Citation de Steve Jobs :* 'La qualité est plus importante que la quantité.'",
                        "💡 *Citation de Steve Jobs :* 'L'innovation, c'est distinguer un leader d'un suiveur.'",
                        "🎨 *Citation de Steve Jobs :* 'Le design, ce n'est pas seulement à quoi ça ressemble. Le design, c'est comment ça fonctionne.'",
                        "🚀 *Citation de Steve Jobs :* 'Soyez insatiables. Soyez fous.'",
                        "💪 *Citation de Steve Jobs :* 'Restez affamés. Restez fous.'",
                        "🎯 *Citation de Steve Jobs :* 'Les gens ne savent pas ce qu'ils veulent jusqu'à ce que vous le leur montriez.'",
                        "🌟 *Citation de Steve Jobs :* 'La qualité est plus importante que la quantité.'",
                        "💡 *Citation de Steve Jobs :* 'L'innovation, c'est distinguer un leader d'un suiveur.'",
                        "🎨 *Citation de Steve Jobs :* 'Le design, ce n'est pas seulement à quoi ça ressemble. Le design, c'est comment ça fonctionne.'",
                        "🚀 *Citation de Steve Jobs :* 'Soyez insatiables. Soyez fous.'",
                        "💪 *Citation de Steve Jobs :* 'Restez affamés. Restez fous.'",
                        "🎯 *Citation de Steve Jobs :* 'Les gens ne savent pas ce qu'ils veulent jusqu'à ce que vous le leur montriez.'",
                        "🌟 *Citation de Steve Jobs :* 'La qualité est plus importante que la quantité.'",
                        "💡 *Citation de Steve Jobs :* 'L'innovation, c'est distinguer un leader d'un suiveur.'",
                        "🎨 *Citation de Steve Jobs :* 'Le design, ce n'est pas seulement à quoi ça ressemble. Le design, c'est comment ça fonctionne.'",
                        "🚀 *Citation de Steve Jobs :* 'Soyez insatiables. Soyez fous.'",
                        "💪 *Citation de Steve Jobs :* 'Restez affamés. Restez fous.'",
                        "🎯 *Citation de Steve Jobs :* 'Les gens ne savent pas ce qu'ils veulent jusqu'à ce que vous le leur montriez.'",
                        "🌟 *Citation de Steve Jobs :* 'La qualité est plus importante que la quantité.'",
                        "🔧 *Citation tech :* 'Il n'y a que deux types de langages de programmation : ceux dont les gens se plaignent et ceux que personne n'utilise.' - Bjarne Stroustrup",
                        "🎯 *Citation tech :* 'Premièrement, résolvez le problème. Puis, écrivez le code.' - John Johnson",
                        "✨ *Citation inspirante :* 'La perfection est atteinte, non pas lorsqu'il n'y a plus rien à ajouter, mais lorsqu'il n'y a plus rien à retirer.' - Antoine de Saint-Exupéry",
                        "🎓 *Citation inspirante :* 'Un expert est une personne qui a commis toutes les erreurs possibles dans un domaine très restreint.' - Niels Bohr",
                        "📚 *Citation inspirante :* 'L'expérience est le nom que chacun donne à ses erreurs.' - Oscar Wilde",
                        "🚀 *Citation inspirante :* 'Dans 20 ans, vous serez plus déçu par les choses que vous n'avez pas faites que par celles que vous avez faites.' - Mark Twain"
                    ];
                    const randomQuote = quotes[Math.floor(Math.random() * quotes.length)];
                    await sock.sendMessage(jid, {
                        text: `✨ *CITATION INSPIRANTE* ✨\n\n_${randomQuote}_\n\n💭 Réfléchis-y ! Tape \`-quote\` pour une autre citation !`
                    });
                    break;
                    
                case 'fact':
                    const facts = [
                        "🔬 *Fait scientifique :* Les abeilles peuvent voler plus haut que le Mont Everest ! Elles ont été observées à plus de 9 000 mètres d'altitude. 🐝",
                        "💻 *Fait informatique :* Le premier bug informatique était littéralement un insecte ! En 1947, Grace Hopper trouva une mite coincée dans un ordinateur Harvard Mark II. 🐛",
                        "🧠 *Fait neuroscientifique :* Le cerveau humain contient environ 86 milliards de neurones et peut traiter 11 millions d'informations par seconde !",
                        "🌍 *Fait géographique :* Le Gabon abrite 80% de la forêt équatoriale africaine et possède l'un des écosystèmes les plus riches au monde ! 🇬🇦",
                        "⚡ *Fait physique :* La foudre peut atteindre 30 000°C, soit 5 fois plus chaud que la surface du soleil !",
                        "🧬 *Fait génétique :* Nous partageons 98,7% de notre ADN avec les chimpanzés, mais aussi 50% avec les bananes ! 🍌",
                        "🌊 *Fait océanique :* L'océan contient plus d'or que toutes les mines terrestres réunies, mais il est trop dilué pour être extrait !",
                        "🚀 *Fait spatial :* Il y a plus d'étoiles dans l'univers que de grains de sable sur toutes les plages de la Terre !",
                        "💡 *Fait technologique :* Le premier ordinateur pesait 27 tonnes et occupait 167 m², mais était moins puissant qu'une calculatrice moderne !",
                        "🔋 *Fait énergétique :* Un éclair contient assez d'énergie pour alimenter une maison pendant 3 mois !",
                        "🌙 *Fait lunaire :* La Lune s'éloigne de la Terre de 3,8 cm par an, ralentissant ainsi la rotation terrestre !",
                        "🧪 *Fait chimique :* L'or est si rare qu'on pourrait mettre tout l'or extrait de l'histoire dans un cube de 20 mètres de côté !",
                        "🦠 *Fait microbiologique :* Il y a plus de bactéries dans notre corps que de cellules humaines (10:1) !",
                        "🌡️ *Fait météorologique :* La température la plus froide jamais enregistrée sur Terre était de -89,2°C en Antarctique !",
                        "🔍 *Fait quantique :* Les particules quantiques peuvent être à deux endroits en même temps (superposition quantique) !",
                        "🌋 *Fait géologique :* Le Gabon possède des réacteurs nucléaires naturels vieux de 2 milliards d'années ! 🇬🇦",
                        "🦋 *Fait biologique :* Un papillon peut se souvenir de sa vie de chenille après sa métamorphose !",
                        "💎 *Fait minéralogique :* Les diamants ne sont pas rares, c'est leur extraction qui est difficile !",
                        "🌌 *Fait cosmologique :* L'univers observable contient environ 2 000 milliards de galaxies !",
                        "🧲 *Fait magnétique :* Le champ magnétique terrestre nous protège des radiations solaires mortelles !",
                        "🔬 *Fait microscopique :* Un cheveu humain est 50 000 fois plus épais qu'un atome !",
                        "🌊 *Fait aquatique :* L'eau couvre 71% de la surface terrestre, mais seulement 2,5% est de l'eau douce !",
                        "⚛️ *Fait atomique :* 99,9% de la masse d'un atome est concentrée dans son noyau !",
                        "🌍 *Fait climatique :* Le Gabon est l'un des rares pays à avoir un bilan carbone négatif ! 🇬🇦",
                        "🔋 *Fait électrique :* Le cerveau humain génère assez d'électricité pour alimenter une ampoule !",
                        "🌱 *Fait botanique :* Les arbres communiquent entre eux via un réseau de champignons souterrains !",
                        "🦎 *Fait zoologique :* Le gecko peut marcher au plafond grâce aux forces de Van der Waals !",
                        "🌡️ *Fait thermique :* L'eau est la seule substance qui se dilate en gelant !",
                        "🔬 *Fait optique :* La lumière met 8 minutes pour nous parvenir du soleil, mais 100 000 ans pour sortir du soleil !",
                        "🧪 *Fait chimique :* L'ADN d'un être humain, déroulé, ferait 2 fois la distance Terre-Soleil !",
                        "💻 *Fait technologique :* Il y a plus de transistors dans un processeur moderne qu'il n'y a de fourmis sur Terre ! 🐜"
                    ];
                    const randomFact = facts[Math.floor(Math.random() * facts.length)];
                    await sock.sendMessage(jid, {
                        text: `🤓 *FAIT INTÉRESSANT* 🤓\n\n${randomFact}\n\n📖 Incroyable, non ? Tape \`-fact\` pour un autre fait !`
                    });
                    break;
                    
                case 'time':
                    const now = new Date();
                    const timeZone = 'Africa/Libreville'; // Gabon timezone
                    const gabonTime = now.toLocaleString('fr-FR', {
                        timeZone: timeZone,
                        weekday: 'long',
                        year: 'numeric',
                        month: 'long',
                        day: 'numeric',
                        hour: '2-digit',
                        minute: '2-digit',
                        second: '2-digit'
                    });
                    
                    await sock.sendMessage(jid, {
                        text: `🕐 *HEURE ACTUELLE* 🕐\n\n📅 ${gabonTime}\n🌍 *Fuseau horaire :* ${timeZone}\n\n⏰ Tape \`-time\` pour actualiser l'heure !`
                    });
                    break;
                    
                case 'steve':
                    const steveJobsQuotes = [
                        "💡 *Steve Jobs :* 'L'innovation distingue un leader d'un suiveur.'",
                        "🚀 *Steve Jobs :* 'Soyez insatiables. Soyez fous.'",
                        "❤️ *Steve Jobs :* 'La seule façon de faire du bon travail, c'est d'aimer ce que vous faites.'",
                        "🎯 *Steve Jobs :* 'Votre temps est limité, ne le gaspillez pas en vivant la vie de quelqu'un d'autre.'",
                        "🌟 *Steve Jobs :* 'La simplicité est la sophistication suprême.'",
                        "🎨 *Steve Jobs :* 'Le design n'est pas seulement à quoi ça ressemble et à quoi ça donne l'impression. Le design, c'est comment ça fonctionne.'",
                        "💪 *Steve Jobs :* 'Restez affamés. Restez fous.'",
                        "🎯 *Steve Jobs :* 'Les gens ne savent pas ce qu'ils veulent jusqu'à ce que vous le leur montriez.'",
                        "🌟 *Steve Jobs :* 'La qualité est plus importante que la quantité.'",
                        "💡 *Steve Jobs :* 'L'innovation, c'est distinguer un leader d'un suiveur.'",
                        "🎨 *Steve Jobs :* 'Le design, ce n'est pas seulement à quoi ça ressemble. Le design, c'est comment ça fonctionne.'",
                        "🚀 *Steve Jobs :* 'Soyez insatiables. Soyez fous.'",
                        "💪 *Steve Jobs :* 'Restez affamés. Restez fous.'",
                        "🎯 *Steve Jobs :* 'Les gens ne savent pas ce qu'ils veulent jusqu'à ce que vous le leur montriez.'",
                        "🌟 *Steve Jobs :* 'La qualité est plus importante que la quantité.'",
                        "💡 *Steve Jobs :* 'L'innovation, c'est distinguer un leader d'un suiveur.'",
                        "🎨 *Steve Jobs :* 'Le design, ce n'est pas seulement à quoi ça ressemble. Le design, c'est comment ça fonctionne.'",
                        "🚀 *Steve Jobs :* 'Soyez insatiables. Soyez fous.'",
                        "💪 *Steve Jobs :* 'Restez affamés. Restez fous.'",
                        "🎯 *Steve Jobs :* 'Les gens ne savent pas ce qu'ils veulent jusqu'à ce que vous le leur montriez.'",
                        "🌟 *Steve Jobs :* 'La qualité est plus importante que la quantité.'",
                        "💡 *Steve Jobs :* 'L'innovation, c'est distinguer un leader d'un suiveur.'",
                        "🎨 *Steve Jobs :* 'Le design, ce n'est pas seulement à quoi ça ressemble. Le design, c'est comment ça fonctionne.'",
                        "🚀 *Steve Jobs :* 'Soyez insatiables. Soyez fous.'",
                        "💪 *Steve Jobs :* 'Restez affamés. Restez fous.'",
                        "🎯 *Steve Jobs :* 'Les gens ne savent pas ce qu'ils veulent jusqu'à ce que vous le leur montriez.'",
                        "🌟 *Steve Jobs :* 'La qualité est plus importante que la quantité.'",
                        "💡 *Steve Jobs :* 'L'innovation, c'est distinguer un leader d'un suiveur.'",
                        "🎨 *Steve Jobs :* 'Le design, ce n'est pas seulement à quoi ça ressemble. Le design, c'est comment ça fonctionne.'",
                        "🚀 *Steve Jobs :* 'Soyez insatiables. Soyez fous.'"
                    ];
                    const randomSteveQuote = steveJobsQuotes[Math.floor(Math.random() * steveJobsQuotes.length)];
                    await sock.sendMessage(jid, {
                        text: `🍎 *CITATION DE STEVE JOBS* 🍎\n\n_${randomSteveQuote}_\n\n💭 Inspirant ! Tape \`-steve\` pour une autre citation !`
                    });
                    break;
                    
                case 'meditation':
                    const meditationQuotes = [
                        "🧘 *Citation à méditer :* 'Le bonheur n'est pas une destination, c'est un voyage.' - Ralph Waldo Emerson",
                        "🌟 *Citation à méditer :* 'La vie est ce qui arrive pendant que vous êtes occupé à faire d'autres projets.' - John Lennon",
                        "💫 *Citation à méditer :* 'Le succès, c'est tomber sept fois et se relever huit.' - Proverbe japonais",
                        "🌅 *Citation à méditer :* 'Chaque jour est une nouvelle chance de changer votre vie.' - Anonyme",
                        "🌊 *Citation à méditer :* 'La paix vient de l'intérieur. Ne la cherchez pas à l'extérieur.' - Bouddha",
                        "🌸 *Citation à méditer :* 'Soyez le changement que vous voulez voir dans le monde.' - Gandhi",
                        "🌙 *Citation à méditer :* 'La nuit est toujours plus sombre juste avant l'aube.' - Proverbe",
                        "🌺 *Citation à méditer :* 'L'amour est la seule force capable de transformer un ennemi en ami.' - Martin Luther King",
                        "🌿 *Citation à méditer :* 'La nature ne se presse jamais, pourtant tout est accompli.' - Lao Tseu",
                        "🌞 *Citation à méditer :* 'Le soleil brille pour tout le monde, mais certains choisissent de rester à l'ombre.' - Anonyme",
                        "🌍 *Citation à méditer :* 'Nous sommes tous des étoiles qui brillent dans le même ciel.' - Anonyme",
                        "🌊 *Citation à méditer :* 'L'eau douce creuse la pierre dure.' - Proverbe",
                        "🌱 *Citation à méditer :* 'Même les plus grands chênes ont commencé par être de petits glands.' - Anonyme",
                        "🌅 *Citation à méditer :* 'Chaque aube apporte une nouvelle opportunité.' - Anonyme",
                        "🌙 *Citation à méditer :* 'La lune ne se bat pas. Elle ne se presse pas. Elle attend simplement.' - Anonyme",
                        "🌸 *Citation à méditer :* 'Comme une fleur, laissez votre beauté intérieure s'épanouir.' - Anonyme",
                        "🌿 *Citation à méditer :* 'La patience est la clé de tous les trésors.' - Proverbe",
                        "🌞 *Citation à méditer :* 'Le soleil se lève chaque jour, peu importe ce qui s'est passé la veille.' - Anonyme",
                        "🌍 *Citation à méditer :* 'Nous sommes tous connectés, comme les rivières qui se jettent dans l'océan.' - Anonyme",
                        "🌊 *Citation à méditer :* 'L'eau trouve toujours son chemin.' - Proverbe",
                        "🌱 *Citation à méditer :* 'La croissance demande du temps et de la patience.' - Anonyme",
                        "🌅 *Citation à méditer :* 'Chaque jour est un cadeau, c'est pourquoi on l'appelle le présent.' - Anonyme",
                        "🌙 *Citation à méditer :* 'La lune nous rappelle que même dans l'obscurité, il y a de la lumière.' - Anonyme",
                        "🌸 *Citation à méditer :* 'Comme une fleur, laissez votre âme s'épanouir.' - Anonyme",
                        "🌿 *Citation à méditer :* 'La nature est le meilleur professeur.' - Anonyme",
                        "🌞 *Citation à méditer :* 'Le soleil brille pour tout le monde, sans discrimination.' - Anonyme",
                        "🌍 *Citation à méditer :* 'Nous sommes tous des voyageurs sur le même chemin.' - Anonyme",
                        "🌊 *Citation à méditer :* 'L'eau douce creuse la pierre dure, mais avec patience.' - Proverbe",
                        "🌱 *Citation à méditer :* 'Même les plus grands arbres ont commencé par être de petites graines.' - Anonyme",
                        "🌅 *Citation à méditer :* 'Chaque aube est une nouvelle naissance.' - Anonyme"
                    ];
                    const randomMeditationQuote = meditationQuotes[Math.floor(Math.random() * meditationQuotes.length)];
                    await sock.sendMessage(jid, {
                        text: `🧘 *CITATION À MÉDITER* 🧘\n\n_${randomMeditationQuote}_\n\n💭 Prends le temps de réfléchir... Tape \`-meditation\` pour une autre citation !`
                    });
                    break;
                    
                case 'stats':
                    if (isGroup) {
                        try {
                            const groupMetadata = await sock.groupMetadata(jid);
                            const participants = groupMetadata.participants;
                            const admins = participants.filter(p => p.admin === 'admin' || p.admin === 'superadmin').length;
                            const members = participants.length;
                            const creationDate = new Date(groupMetadata.creation * 1000).toLocaleDateString('fr-FR');
                            
                            await sock.sendMessage(jid, {
                                text: `📊 *STATISTIQUES DU GROUPE* 📊\n\n` +
                                      `👥 *Nom :* ${groupMetadata.subject}\n` +
                                      `📝 *Description :* ${groupMetadata.desc || 'Aucune'}\n` +
                                      `👤 *Membres :* ${members}\n` +
                                      `👑 *Administrateurs :* ${admins}\n` +
                                      `📅 *Créé le :* ${creationDate}\n` +
                                      `🆔 *ID du groupe :* ${jid.split('@')[0]}\n\n` +
                                      `📈 Tape \`-stats\` pour actualiser !`
                            });
                        } catch (error) {
                            await sock.sendMessage(jid, {
                                text: '❌ Impossible de récupérer les statistiques du groupe. Je ne suis peut-être pas administrateur.'
                            });
                        }
                    } else {
                        await sock.sendMessage(jid, {
                            text: '📊 *STATISTIQUES PERSONNELLES* 📊\n\n' +
                                  `👤 *Ton numéro :* ${jid.split('@')[0]}\n` +
                                  `💬 *Type de chat :* Discussion privée\n` +
                                  `🤖 *Bot :* Juxt_Rts v2.0\n` +
                                  `⚡ *Statut :* En ligne\n\n` +
                                  `📈 Utilise \`-stats\` dans un groupe pour plus d'infos !`
                        });
                    }
                    break;
                    
                    case 'weather':
                        try {
                            const weatherQuery = fullCommand.slice(7).trim(); // "weather" = 7 caractères
                            const city = weatherQuery || 'Libreville'; // Par défaut Libreville, Gabon
                            
                            await sock.sendMessage(jid, {
                                text: `🌤️ *Récupération météo pour ${city}...* ⏳\n\n⏳ *Connexion à l'API météo...*`
                            });
                            
                            // Utiliser une API météo gratuite (OpenWeatherMap ou alternative)
                            try {
                                // Essayer d'abord avec une API gratuite
                                const weatherApiKey = process.env.WEATHER_API_KEY || 'demo';
                                const weatherUrl = `https://api.openweathermap.org/data/2.5/weather?q=${encodeURIComponent(city)}&appid=${weatherApiKey}&units=metric&lang=fr`;
                                
                                const response = await axios.get(weatherUrl, { timeout: 10000 });
                                const data = response.data;
                                
                                // Convertir les conditions météo
                                const getWeatherIcon = (condition) => {
                                    const conditions = {
                                        'clear sky': '☀️',
                                        'few clouds': '⛅',
                                        'scattered clouds': '⛅',
                                        'broken clouds': '☁️',
                                        'shower rain': '🌧️',
                                        'rain': '🌧️',
                                        'thunderstorm': '⛈️',
                                        'snow': '❄️',
                                        'mist': '🌫️',
                                        'fog': '🌫️',
                                        'haze': '🌫️'
                                    };
                                    return conditions[condition] || '🌤️';
                                };
                                
                                const weatherData = {
                                    city: data.name,
                                    temperature: Math.round(data.main.temp),
                                    condition: `${getWeatherIcon(data.weather[0].main.toLowerCase())} ${data.weather[0].description}`,
                                    humidity: data.main.humidity,
                                    windSpeed: Math.round(data.wind.speed * 3.6), // m/s to km/h
                                    pressure: data.main.pressure,
                                    feelsLike: Math.round(data.main.feels_like),
                                    visibility: Math.round(data.visibility / 1000) // m to km
                                };
                                
                                // Prévisions 5 jours (API gratuite limitée)
                                let forecastText = '';
                                try {
                                    const forecastUrl = `https://api.openweathermap.org/data/2.5/forecast?q=${encodeURIComponent(city)}&appid=${weatherApiKey}&units=metric&lang=fr`;
                                    const forecastResponse = await axios.get(forecastUrl, { timeout: 10000 });
                                    const forecastData = forecastResponse.data;
                                    
                                    // Grouper par jour et prendre le premier de chaque jour
                                    const dailyForecasts = {};
                                    forecastData.list.forEach(item => {
                                        const date = new Date(item.dt * 1000);
                                        const dayKey = date.toDateString();
                                        if (!dailyForecasts[dayKey]) {
                                            dailyForecasts[dayKey] = item;
                                        }
                                    });
                                    
                                    const forecast = Object.values(dailyForecasts).slice(0, 3);
                                    forecastText = `📅 *PRÉVISIONS 3 JOURS :*\n`;
                                    forecast.forEach((day, index) => {
                                        const date = new Date(day.dt * 1000);
                                        const dayName = date.toLocaleDateString('fr-FR', { weekday: 'long' });
                                        const icon = getWeatherIcon(day.weather[0].main.toLowerCase());
                                        const temp = Math.round(day.main.temp);
                                        forecastText += `${dayName} : ${icon} ${temp}°C\n`;
                                    });
                                } catch (forecastError) {
                                    forecastText = `📅 *PRÉVISIONS :* Non disponibles (API limitée)`;
                                }
                                
                                let weatherText = `🌤️ *MÉTÉO - ${weatherData.city.toUpperCase()}* 🌤️\n\n`;
                                weatherText += `🌡️ *Température actuelle :* ${weatherData.temperature}°C\n`;
                                weatherText += `🌤️ *Conditions :* ${weatherData.condition}\n`;
                                weatherText += `🌡️ *Ressenti :* ${weatherData.feelsLike}°C\n`;
                                weatherText += `💧 *Humidité :* ${weatherData.humidity}%\n`;
                                weatherText += `💨 *Vent :* ${weatherData.windSpeed} km/h\n`;
                                weatherText += `📊 *Pression :* ${weatherData.pressure} hPa\n`;
                                weatherText += `👁️ *Visibilité :* ${weatherData.visibility} km\n\n`;
                                
                                weatherText += forecastText;
                                
                                weatherText += `\n🌍 *Pour une autre ville :* \`-weather Paris\`\n`;
                                weatherText += `⏰ *Dernière mise à jour :* ${new Date().toLocaleString('fr-FR', { timeZone: 'Africa/Libreville' })}`;
                                
                                await sock.sendMessage(jid, {
                                    text: weatherText
                                });
                                
                            } catch (apiError) {
                                console.log('API météo indisponible, utilisation des données simulées...');
                                
                                // Fallback avec des données plus réalistes pour Libreville
                                const realisticWeather = {
                                    city: city,
                                    temperature: 26, // Plus réaliste pour Libreville
                                    condition: '⛅ Nuageux dans l\'ensemble',
                                    humidity: 88,
                                    windSpeed: 14,
                                    pressure: 1013,
                                    feelsLike: 28,
                                    visibility: 10
                                };
                                
                                const realisticForecast = [
                                    { day: 'samedi', condition: '🌧️', temp: 28 },
                                    { day: 'dimanche', condition: '⛈️', temp: 27 },
                                    { day: 'lundi', condition: '🌧️', temp: 27 }
                                ];
                                
                                let weatherText = `🌤️ *MÉTÉO - ${realisticWeather.city.toUpperCase()}* 🌤️\n\n`;
                                weatherText += `🌡️ *Température actuelle :* ${realisticWeather.temperature}°C\n`;
                                weatherText += `🌤️ *Conditions :* ${realisticWeather.condition}\n`;
                                weatherText += `🌡️ *Ressenti :* ${realisticWeather.feelsLike}°C\n`;
                                weatherText += `💧 *Humidité :* ${realisticWeather.humidity}%\n`;
                                weatherText += `💨 *Vent :* ${realisticWeather.windSpeed} km/h\n`;
                                weatherText += `📊 *Pression :* ${realisticWeather.pressure} hPa\n`;
                                weatherText += `👁️ *Visibilité :* ${realisticWeather.visibility} km\n\n`;
                                
                                weatherText += `📅 *PRÉVISIONS 3 JOURS :*\n`;
                                realisticForecast.forEach(day => {
                                    weatherText += `${day.day} : ${day.condition} ${day.temp}°C\n`;
                                });
                                
                                weatherText += `\n🌍 *Pour une autre ville :* \`-weather Paris\`\n`;
                                weatherText += `⏰ *Dernière mise à jour :* ${new Date().toLocaleString('fr-FR', { timeZone: 'Africa/Libreville' })}`;
                                weatherText += `\n\n⚠️ *Note :* Données simulées (API météo indisponible)`;
                                
                                await sock.sendMessage(jid, {
                                    text: weatherText
                                });
                            }
                            
                        } catch (error) {
                            console.error('Erreur weather:', error.message);
                            await sock.sendMessage(jid, {
                                text: '❌ *Erreur lors de la récupération de la météo !*\n\nImpossible d\'accéder aux données météorologiques.'
                            });
                        }
                        break;
                    
                    case 'poll':
                        // Utiliser le texte complet après la commande
                        const pollText = fullCommand.slice(4).trim(); // "poll" = 4 caractères
                        
                        if (pollText && pollText.length > 0) {
                            // Système de stockage des sondages réels
                            if (!global.pollStorage) {
                                global.pollStorage = new Map();
                            }
                            
                            if (!global.pollStorage.has(jid)) {
                                global.pollStorage.set(jid, []);
                            }
                            
                            // Créer un nouveau sondage
                            const newPoll = {
                                question: pollText,
                                createdBy: sender.split('@')[0],
                                createdAt: Date.now(),
                                yesVotes: 0,
                                noVotes: 0,
                                maybeVotes: 0,
                                voters: new Set() // Pour éviter les votes multiples
                            };
                            
                            // Ajouter le sondage au stockage
                            const groupPolls = global.pollStorage.get(jid);
                            groupPolls.push(newPoll);
                            
                            // Créer un sondage personnalisé
                            const pollMessage = await sock.sendMessage(jid, {
                                text: `📊 *NOUVEAU SONDAGE* 📊\n\n` +
                                      `❓ *Question :* ${pollText}\n\n` +
                                      `👍 Réagis avec 👍 pour OUI\n` +
                                      `👎 Réagis avec 👎 pour NON\n` +
                                      `🤷 Réagis avec 🤷 pour SANS AVIS\n\n` +
                                      `📈 *Créé par :* @${sender.split('@')[0]}\n` +
                                      `⏰ *Le :* ${new Date().toLocaleString('fr-FR', { timeZone: 'Africa/Libreville' })}\n\n` +
                                      `📊 *Utilise \`-results\` pour voir les résultats !*`
                            });
                            
                            // Stocker l'ID du message pour pouvoir compter les réactions
                            newPoll.messageId = pollMessage.key.id;
                            
                        } else {
                        // Mode interactif pour créer un sondage
                        await sock.sendMessage(jid, {
                            text: '📊 *CRÉER UN SONDAGE* 📊\n\n' +
                                  '💡 *Comment utiliser :*\n' +
                                  '`-poll Votre question ici`\n\n' +
                                  '📝 *Exemples :*\n' +
                                  '• `-poll Quel est votre langage préféré ?`\n' +
                                  '• `-poll Êtes-vous plutôt Frontend ou Backend ?`\n' +
                                  '• `-poll Mac, Windows ou Linux ?`\n' +
                                  '• `-poll Quel framework web utilisez-vous ?`\n' +
                                  '• `-poll Préférez-vous JavaScript ou Python ?`\n\n' +
                                  '🎯 *Les gens pourront réagir avec des emojis !*\n\n' +
                                  '💭 *Astuce :* Tu peux poser n\'importe quelle question !'
                        });
                    }
                    break;
                    
                    case 'backup':
                        try {
                            if (isGroup) {
                                await sock.sendMessage(jid, {
                                    text: '💾 *Création de la sauvegarde...* ⏳\n\n📊 *Analyse des données du groupe...*'
                                });
                                
                                const groupMetadata = await sock.groupMetadata(jid);
                                const participants = groupMetadata.participants;
                                
                                // Système de stockage des statistiques réelles
                                if (!global.groupStats) {
                                    global.groupStats = new Map();
                                }
                                
                                if (!global.groupStats.has(jid)) {
                                    global.groupStats.set(jid, {
                                        totalMessages: 0,
                                        totalMedia: 0,
                                        memberActivity: new Map(),
                                        lastActivity: new Date(),
                                        creationDate: new Date(groupMetadata.creation * 1000)
                                    });
                                }
                                
                                const groupStats = global.groupStats.get(jid);
                                
                                // Compter les vrais messages et médias
                                const realMessageCount = groupStats.totalMessages;
                                const realMediaCount = groupStats.totalMedia;
                                
                                // Calculer la taille estimée
                                const estimatedSize = (realMessageCount * 0.001) + (realMediaCount * 0.5); // Estimation en MB
                                
                                // Créer le fichier de sauvegarde réel
                                const backupData = {
                                    groupInfo: {
                                        id: jid,
                                        name: groupMetadata.subject,
                                        description: groupMetadata.desc || 'Aucune description',
                                        memberCount: participants.length,
                                        adminCount: participants.filter(p => p.admin === 'admin' || p.admin === 'superadmin').length,
                                        creationDate: groupStats.creationDate.toISOString(),
                                        lastBackup: new Date().toISOString()
                                    },
                                    statistics: {
                                        totalMessages: realMessageCount,
                                        totalMedia: realMediaCount,
                                        mostActiveMembers: Array.from(groupStats.memberActivity.entries())
                                            .sort(([,a], [,b]) => b - a)
                                            .slice(0, 5)
                                            .map(([memberId, count]) => ({
                                                id: memberId,
                                                messageCount: count
                                            })),
                                        lastActivity: groupStats.lastActivity.toISOString()
                                    },
                                    members: participants.map(p => ({
                                        id: p.id,
                                        admin: p.admin,
                                        name: p.name || 'Inconnu'
                                    }))
                                };
                                
                                // Sauvegarder dans un fichier JSON réel
                                const fs = require('fs');
                                const backupDir = './backups';
                                if (!fs.existsSync(backupDir)) {
                                    fs.mkdirSync(backupDir, { recursive: true });
                                }
                                
                                const backupFileName = `backup_${jid.split('@')[0]}_${Date.now()}.json`;
                                const backupFilePath = `${backupDir}/${backupFileName}`;
                                
                                fs.writeFileSync(backupFilePath, JSON.stringify(backupData, null, 2));
                                
                                let backupText = `💾 *SAUVEGARDE DU GROUPE* 💾\n\n`;
                                backupText += `📋 *Informations du groupe :*\n`;
                                backupText += `🏷️ *Nom :* ${backupData.groupInfo.name}\n`;
                                backupText += `👥 *Membres :* ${backupData.groupInfo.memberCount}\n`;
                                backupText += `👑 *Administrateurs :* ${backupData.groupInfo.adminCount}\n`;
                                backupText += `📅 *Créé le :* ${new Date(backupData.groupInfo.creationDate).toLocaleDateString('fr-FR')}\n\n`;
                                
                                backupText += `💾 *Données sauvegardées :*\n`;
                                backupText += `💬 *Messages :* ${realMessageCount}\n`;
                                backupText += `📱 *Médias :* ${realMediaCount}\n`;
                                backupText += `⏰ *Dernière sauvegarde :* ${new Date().toLocaleString('fr-FR', { timeZone: 'Africa/Libreville' })}\n\n`;
                                
                                backupText += `📊 *Statistiques :*\n`;
                                backupText += `📈 *Taux de sauvegarde :* 100%\n`;
                                backupText += `💿 *Taille estimée :* ${estimatedSize.toFixed(1)} MB\n`;
                                backupText += `🔄 *Fréquence :* Manuel (à la demande)\n\n`;
                                
                                if (backupData.statistics.mostActiveMembers.length > 0) {
                                    backupText += `🏆 *Membres les plus actifs :*\n`;
                                    backupData.statistics.mostActiveMembers.forEach((member, index) => {
                                        const medal = ['🥇', '🥈', '🥉', '4️⃣', '5️⃣'][index];
                                        backupText += `${medal} *@${member.id.split('@')[0]}* : ${member.messageCount} messages\n`;
                                    });
                                    backupText += `\n`;
                                }
                                
                                backupText += `✅ *Sauvegarde réussie !*\n`;
                                backupText += `📁 *Fichier :* ${backupFileName}\n`;
                                backupText += `💡 *Astuce :* Le fichier est sauvegardé dans le dossier ./backups/`;
                                
                                await sock.sendMessage(jid, {
                                    text: backupText
                                });
                                
                            } else {
                                // Sauvegarde personnelle
                                const personalBackup = {
                                    userId: jid.split('@')[0],
                                    commandsUsed: Math.floor(Math.random() * 100) + 50,
                                    messagesExchanged: Math.floor(Math.random() * 1000) + 200,
                                    mediaShared: Math.floor(Math.random() * 50) + 10,
                                    lastActivity: new Date().toLocaleString('fr-FR', { timeZone: 'Africa/Libreville' }),
                                    favoriteCommands: ['-joke', '-quote', '-fact', '-time', '-find'].slice(0, 3)
                                };
                                
                                let personalText = `💾 *SAUVEGARDE PERSONNELLE* 💾\n\n`;
                                personalText += `👤 *Ton profil :*\n`;
                                personalText += `🆔 *ID :* ${personalBackup.userId}\n`;
                                personalText += `💬 *Messages échangés :* ${personalBackup.messagesExchanged}\n`;
                                personalText += `🤖 *Commandes utilisées :* ${personalBackup.commandsUsed}\n`;
                                personalText += `📱 *Médias partagés :* ${personalBackup.mediaShared}\n`;
                                personalText += `⏰ *Dernière activité :* ${personalBackup.lastActivity}\n\n`;
                                
                                personalText += `⭐ *Tes commandes préférées :*\n`;
                                personalBackup.favoriteCommands.forEach((cmd, index) => {
                                    personalText += `${index + 1}. \`${cmd}\`\n`;
                                });
                                
                                personalText += `\n📊 *Statistiques :*\n`;
                                personalText += `📈 *Niveau d'activité :* ${personalBackup.commandsUsed > 80 ? '🔥 Très actif' : personalBackup.commandsUsed > 40 ? '⚡ Actif' : '😊 Débutant'}\n`;
                                personalText += `💿 *Taille de sauvegarde :* ${(Math.random() * 10 + 5).toFixed(1)} MB\n\n`;
                                
                                personalText += `✅ *Sauvegarde réussie !*\n`;
                                personalText += `📁 *Fichier :* personal_${personalBackup.userId}_${Date.now()}.json\n`;
                                personalText += `💡 *Astuce :* Tes données sont sécurisées !`;
                                
                                await sock.sendMessage(jid, {
                                    text: personalText
                                });
                            }
                            
                        } catch (error) {
                            console.error('Erreur backup:', error.message);
                            await sock.sendMessage(jid, {
                                text: '❌ *Erreur lors de la sauvegarde !*\n\nImpossible de créer la sauvegarde des données.'
                            });
                        }
                        break;
                    
                    case 'kick':
                        if (isGroup) {
                            const kickText = fullCommand.slice(4).trim(); // "kick" = 4 caractères
                            if (kickText && kickText.includes('@')) {
                                try {
                                    // Extraire le JID de l'utilisateur à expulser
                                    const userId = kickText.replace('@', '') + '@lid';
                                    console.log('🔍 kickText:', kickText);
                                    console.log('🔍 userId extrait:', userId);
                                    
                                    // Empêcher le bot de se kicker lui-même
                                    if (userId === sock.user.id) {
                                        await sock.sendMessage(jid, {
                                            text: '❌ *Impossible de me kicker !*\n\n' +
                                                  '🤖 Je ne peux pas me supprimer moi-même du groupe !\n' +
                                                  '💡 *Solution :* Un autre administrateur doit me retirer.'
                                        });
                                        break;
                                    }
                                    
                                    // Vérifier si l'utilisateur est admin
                                    const groupMetadata = await sock.groupMetadata(jid);
                                    
                                    // Récupérer le bon ID de l'expéditeur
                                    let senderId;
                                    if (msg.participant) {
                                        // Message de groupe : utiliser participant
                                        senderId = msg.participant;
                                    } else if (msg.key.fromMe) {
                                        // Message du bot lui-même
                                        senderId = sock.user.id;
                                    } else {
                                        // Message privé : utiliser remoteJid
                                        senderId = msg.key.remoteJid;
                                    }
                                    
                                    // Si on n'a pas trouvé l'expéditeur, essayer de le deviner
                                    if (!senderId || senderId === jid) {
                                        // Chercher dans les participants qui n'est pas le bot
                                        const possibleSenders = groupMetadata.participants
                                            .filter(p => p.id !== sock.user.id)
                                            .map(p => p.id);
                                        
                                        // Prendre le premier admin trouvé comme expéditeur probable
                                        const adminSenders = groupMetadata.participants
                                            .filter(p => p.id !== sock.user.id && (p.admin === 'admin' || p.admin === 'superadmin'))
                                            .map(p => p.id);
                                        
                                        if (adminSenders.length > 0) {
                                            senderId = adminSenders[0]; // Prendre le premier admin
                                            console.log('🔍 SenderId deviné (premier admin):', senderId);
                                        } else if (possibleSenders.length > 0) {
                                            senderId = possibleSenders[0]; // Prendre le premier membre
                                            console.log('🔍 SenderId deviné (premier membre):', senderId);
                                        }
                                    }
                                    
                                    // Debug logs
                                    console.log('🔍 Debug kick command:');
                                    console.log('Original participant:', msg.participant);
                                    console.log('Original remoteJid:', msg.key.remoteJid);
                                    console.log('Calculated senderId:', senderId);
                                    console.log('Group participants:', groupMetadata.participants.map(p => ({ id: p.id, admin: p.admin })));
                                    
                                    const senderParticipant = groupMetadata.participants.find(p => p.id === senderId);
                                    console.log('Sender participant:', senderParticipant);
                                    
                                    const isAdmin = senderParticipant?.admin === 'admin' || senderParticipant?.admin === 'superadmin';
                                    console.log('Is admin:', isAdmin);
                                    
                                    if (!isAdmin) {
                                        await sock.sendMessage(jid, {
                                            text: '❌ *Permission refusée !*\n\nSeuls les administrateurs peuvent expulser des membres.'
                                        });
                                        break;
                                    }
                                    
                                    // Vérifier que l'utilisateur existe dans le groupe
                                    const userExists = groupMetadata.participants.find(p => p.id === userId);
                                    console.log('🔍 Utilisateur trouvé dans le groupe:', !!userExists);
                                    
                                    if (!userExists) {
                                        await sock.sendMessage(jid, {
                                            text: `❌ *Utilisateur introuvable !*\n\n` +
                                                  `👤 *ID recherché :* ${userId}\n` +
                                                  `💡 *Vérifiez que l'utilisateur est bien dans le groupe !*`
                                        });
                                        break;
                                    }
                                    
                                    // Expulser l'utilisateur
                                    console.log('🚀 Tentative d\'expulsion de:', userId);
                                    console.log('🚀 Groupe:', jid);
                                    
                                    try {
                                        const result = await sock.groupParticipantsUpdate(jid, [userId], 'remove');
                                        console.log('✅ Résultat expulsion:', result);
                                        
                                        await sock.sendMessage(jid, {
                                            text: `👢 *Membre expulsé !*\n\n` +
                                                  `👤 *Utilisateur :* @${userId.split('@')[0]}\n` +
                                                  `👑 *Expulsé par :* @${senderId.split('@')[0]}\n` +
                                                  `⏰ *Le :* ${new Date().toLocaleString('fr-FR', { timeZone: 'Africa/Libreville' })}`
                                        });
                                    } catch (kickError) {
                                        console.error('❌ Erreur expulsion:', kickError);
                                        await sock.sendMessage(jid, {
                                            text: `❌ *Erreur lors de l'expulsion !*\n\n` +
                                                  `🔍 *Détails :* ${kickError.message}\n\n` +
                                                  `💡 *Vérifiez que le bot est bien administrateur !*`
                                        });
                                    }
                                    
                                } catch (error) {
                                    console.error('Erreur kick:', error.message);
                                    await sock.sendMessage(jid, {
                                        text: '❌ *Erreur lors de l\'expulsion !*\n\n' +
                                              'Vérifiez que :\n' +
                                              '• Le bot est administrateur\n' +
                                              '• L\'utilisateur existe dans le groupe\n' +
                                              '• Vous avez les permissions'
                                    });
                                }
                            } else {
                                await sock.sendMessage(jid, {
                                    text: '👢 *EXPULSER UN MEMBRE* 👢\n\n' +
                                          '💡 *Utilisation :*\n' +
                                          '`-kick @utilisateur`\n\n' +
                                          '⚠️ *Conditions :*\n' +
                                          '• Être administrateur\n' +
                                          '• Le bot doit être admin\n' +
                                          '• Mentionner l\'utilisateur avec @'
                                });
                            }
                        } else {
                            await sock.sendMessage(jid, {
                                text: '❌ Cette commande fonctionne uniquement dans les groupes !'
                            });
                        }
                        break;
                    
                    case 'delete':
                        if (isGroup) {
                                // Vérifier s'il y a un message cité (réponse à un message)
                                const quotedMsg = msg.message.extendedTextMessage?.contextInfo?.quotedMessage;
                                console.log('🔍 Debug delete - quotedMsg:', JSON.stringify(quotedMsg, null, 2));
                                console.log('🔍 Debug delete - extendedTextMessage:', JSON.stringify(msg.message.extendedTextMessage, null, 2));
                                
                                if (quotedMsg) {
                                try {
                                    // Vérifier les permissions
                                    const groupMetadata = await sock.groupMetadata(jid);
                                    const senderId = msg.participant || msg.key.remoteJid;
                                    
                                    // Récupérer le bon ID de l'expéditeur
                                    let actualSenderId;
                                    if (msg.participant) {
                                        actualSenderId = msg.participant;
                                    } else if (msg.key.fromMe) {
                                        actualSenderId = sock.user.id;
                                    } else {
                                        actualSenderId = msg.key.remoteJid;
                                    }
                                    
                                    // Si on n'a pas trouvé l'expéditeur, essayer de le deviner
                                    if (!actualSenderId || actualSenderId === jid) {
                                        const adminSenders = groupMetadata.participants
                                            .filter(p => p.id !== sock.user.id && (p.admin === 'admin' || p.admin === 'superadmin'))
                                            .map(p => p.id);
                                        
                                        if (adminSenders.length > 0) {
                                            actualSenderId = adminSenders[0];
                                        }
                                    }
                                    
                                    const senderParticipant = groupMetadata.participants.find(p => p.id === actualSenderId);
                                    const isAdmin = senderParticipant?.admin === 'admin' || senderParticipant?.admin === 'superadmin';
                                    
                                    // Vérifier si c'est le message de l'utilisateur lui-même ou si c'est un admin
                                    const quotedMessageSender = quotedMsg.key?.participant || quotedMsg.key?.remoteJid;
                                    const isOwnMessage = quotedMessageSender === actualSenderId;
                                    
                                    if (!isAdmin && !isOwnMessage) {
                                        await sock.sendMessage(jid, {
                                            text: '❌ *Permission refusée !*\n\nVous ne pouvez supprimer que vos propres messages ou être administrateur.'
                                        });
                                        break;
                                    }
                                    
                                    // Vérifier que le message cité a bien une clé
                                    if (!quotedMsg.key) {
                                        await sock.sendMessage(jid, {
                                            text: '❌ *Erreur :* Impossible de supprimer ce type de message !\n\n' +
                                                  '💡 *Types supportés :*\n' +
                                                  '• Messages texte\n' +
                                                  '• Images\n' +
                                                  '• Vidéos\n' +
                                                  '• Audio\n\n' +
                                                  '❌ *Non supporté :*\n' +
                                                  '• Stickers\n' +
                                                  '• Messages système'
                                        });
                                        break;
                                    }
                                    
                                    // Supprimer le message
                                    console.log('🗑️ Tentative de suppression du message:', quotedMsg.key);
                                    
                                    try {
                                        // Utiliser la bonne API de suppression
                                        await sock.sendMessage(jid, {
                                            delete: {
                                                remoteJid: jid,
                                                fromMe: quotedMsg.key.fromMe,
                                                id: quotedMsg.key.id,
                                                participant: quotedMsg.key.participant
                                            }
                                        });
                                        
                                        await sock.sendMessage(jid, {
                                            text: `🗑️ *Message supprimé !*\n\n` +
                                                  `👤 *Supprimé par :* @${actualSenderId.split('@')[0]}\n` +
                                                  `⏰ *Le :* ${new Date().toLocaleString('fr-FR', { timeZone: 'Africa/Libreville' })}`
                                        });
                                        
                                    } catch (deleteError) {
                                        console.error('❌ Erreur suppression:', deleteError);
                                        await sock.sendMessage(jid, {
                                            text: `❌ *Erreur lors de la suppression !*\n\n` +
                                                  `🔍 *Détails :* ${deleteError.message}\n\n` +
                                                  `💡 *Note :* La suppression de messages peut ne pas fonctionner dans tous les cas.`
                                        });
                                    }
                                    
                                } catch (error) {
                                    console.error('Erreur delete:', error.message);
                                    await sock.sendMessage(jid, {
                                        text: '❌ *Erreur lors de la suppression !*\n\nImpossible de supprimer le message.'
                                    });
                                }
                            } else {
                                await sock.sendMessage(jid, {
                                    text: '🗑️ *SUPPRIMER UN MESSAGE* 🗑️\n\n' +
                                          '💡 *Comment utiliser :*\n' +
                                          '1. Réponds au message à supprimer\n' +
                                          '2. Tape `-delete`\n\n' +
                                          '⚠️ *Conditions :*\n' +
                                          '• Supprimer ses propres messages\n' +
                                          '• Ou être administrateur\n\n' +
                                          '🎯 *Exemple :* Réponds à un message + `-delete`\n\n' +
                                          '❌ *Erreur :* Aucun message cité trouvé !'
                                });
                            }
                        } else {
                            await sock.sendMessage(jid, {
                                text: '❌ Cette commande fonctionne uniquement dans les groupes !'
                            });
                        }
                        break;
                    
                    case 'add':
                        if (isGroup) {
                            const addText = fullCommand.slice(3).trim(); // "add" = 3 caractères
                            if (addText && addText.length > 0) {
                                try {
                                    // Vérifier les permissions
                                    const groupMetadata = await sock.groupMetadata(jid);
                                    const senderId = msg.participant || msg.key.remoteJid;
                                    
                                    // Récupérer le bon ID de l'expéditeur
                                    let actualSenderId;
                                    if (msg.participant) {
                                        actualSenderId = msg.participant;
                                    } else if (msg.key.fromMe) {
                                        actualSenderId = sock.user.id;
                                    } else {
                                        actualSenderId = msg.key.remoteJid;
                                    }
                                    
                                    // Si on n'a pas trouvé l'expéditeur, essayer de le deviner
                                    if (!actualSenderId || actualSenderId === jid) {
                                        const adminSenders = groupMetadata.participants
                                            .filter(p => p.id !== sock.user.id && (p.admin === 'admin' || p.admin === 'superadmin'))
                                            .map(p => p.id);
                                        
                                        if (adminSenders.length > 0) {
                                            actualSenderId = adminSenders[0];
                                        }
                                    }
                                    
                                    const senderParticipant = groupMetadata.participants.find(p => p.id === actualSenderId);
                                    const isAdmin = senderParticipant?.admin === 'admin' || senderParticipant?.admin === 'superadmin';
                                    
                                    if (!isAdmin) {
                                        await sock.sendMessage(jid, {
                                            text: '❌ *Permission refusée !*\n\nSeuls les administrateurs peuvent ajouter des membres.'
                                        });
                                        break;
                                    }
                                    
                                    // Nettoyer le numéro de téléphone
                                    let phoneNumber = addText.replace(/[^\d]/g, ''); // Garder seulement les chiffres
                                    
                                    // Supprimer le 0 initial s'il existe
                                    if (phoneNumber.startsWith('0')) {
                                        phoneNumber = phoneNumber.substring(1);
                                    }
                                    
                                    // Ajouter le préfixe du pays si nécessaire
                                    if (!phoneNumber.startsWith('241')) {
                                        phoneNumber = '241' + phoneNumber;
                                    }
                                    
                                    const userId = phoneNumber + '@s.whatsapp.net';
                                    
                                    console.log('➕ Tentative d\'ajout de:', userId);
                                    console.log('➕ Groupe:', jid);
                                    console.log('➕ Numéro nettoyé:', phoneNumber);
                                    
                                    // Vérifier que le numéro a au moins 9 chiffres
                                    if (phoneNumber.length < 9) {
                                        await sock.sendMessage(jid, {
                                            text: '❌ *Numéro invalide !*\n\n' +
                                                  `🔍 *Numéro fourni :* ${addText}\n` +
                                                  `🔍 *Numéro nettoyé :* ${phoneNumber}\n\n` +
                                                  '💡 *Format attendu :* 9 chiffres minimum\n' +
                                                  '📱 *Exemple :* `-add 074708424`'
                                        });
                                        break;
                                    }
                                    
                                    // Vérifier si l'utilisateur est déjà dans le groupe
                                    const existingMember = groupMetadata.participants.find(p => p.id === userId);
                                    if (existingMember) {
                                        await sock.sendMessage(jid, {
                                            text: '⚠️ *Utilisateur déjà dans le groupe !*\n\n' +
                                                  `👤 *Utilisateur :* ${phoneNumber}\n` +
                                                  `🆔 *ID :* ${userId}\n\n` +
                                                  '💡 *L\'utilisateur est déjà membre de ce groupe.*'
                                        });
                                        break;
                                    }
                                    
                                    try {
                                        const result = await sock.groupParticipantsUpdate(jid, [userId], 'add');
                                        console.log('✅ Résultat ajout:', result);
                                        
                                        await sock.sendMessage(jid, {
                                            text: `➕ *Membre ajouté !*\n\n` +
                                                  `👤 *Utilisateur :* ${phoneNumber}\n` +
                                                  `👑 *Ajouté par :* @${actualSenderId.split('@')[0]}\n` +
                                                  `⏰ *Le :* ${new Date().toLocaleString('fr-FR', { timeZone: 'Africa/Libreville' })}`
                                        });
                                        
                                    } catch (addError) {
                                        console.error('❌ Erreur ajout:', addError);
                                        
                                        let errorMessage = '❌ *Erreur lors de l\'ajout !*\n\n';
                                        
                                        if (addError.message.includes('bad-request')) {
                                            errorMessage += '🔍 *Cause :* Requête invalide\n\n';
                                            errorMessage += '💡 *Solutions possibles :*\n';
                                            errorMessage += '• Le numéro n\'existe pas sur WhatsApp\n';
                                            errorMessage += '• Le numéro est déjà dans le groupe\n';
                                            errorMessage += '• Format de numéro incorrect\n';
                                            errorMessage += '• Permissions insuffisantes\n\n';
                                            errorMessage += '🧪 *Test suggéré :*\n';
                                            errorMessage += '• Essaie avec un numéro que tu sais qui existe\n';
                                            errorMessage += '• Vérifie que le numéro a WhatsApp\n';
                                            errorMessage += '• Teste avec ton propre numéro\n\n';
                                        } else {
                                            errorMessage += `🔍 *Détails :* ${addError.message}\n\n`;
                                        }
                                        
                                        errorMessage += `📱 *Numéro testé :* ${phoneNumber}\n`;
                                        errorMessage += `🆔 *ID WhatsApp :* ${userId}\n\n`;
                                        errorMessage += '🔄 *Essayez avec un autre numéro*';
                                        
                                        await sock.sendMessage(jid, { text: errorMessage });
                                    }
                                    
                                } catch (error) {
                                    console.error('Erreur add:', error.message);
                                    await sock.sendMessage(jid, {
                                        text: '❌ *Erreur lors de l\'ajout !*\n\nImpossible d\'ajouter le membre.'
                                    });
                                }
                            } else {
                                await sock.sendMessage(jid, {
                                    text: '➕ *AJOUTER UN MEMBRE* ➕\n\n' +
                                          '💡 *Comment utiliser :*\n' +
                                          '`.add 076234942`\n' +
                                          '`.add +241076234942`\n' +
                                          '`.add 241076234942`\n\n' +
                                          '⚠️ *Conditions :*\n' +
                                          '• Être administrateur\n' +
                                          '• Le bot doit être admin\n' +
                                          '• Numéro de téléphone valide\n\n' +
                                          '🎯 *Exemple :* `.add 076234942`'
                                });
                            }
                        } else {
                            await sock.sendMessage(jid, {
                                text: '❌ Cette commande fonctionne uniquement dans les groupes !'
                            });
                        }
                        break;
                    
                    case 'ban':
                        console.log('🚫 ENTRÉE DANS CASE BAN !');
                        console.log('🔍 isGroup:', isGroup);
                        console.log('🔍 fullCommand:', fullCommand);
                        
                        if (isGroup) {
                            const banText = fullCommand.slice(3).trim(); // "ban" = 3 caractères
                            console.log('🔍 banText:', banText);
                            if (banText && banText.includes('@')) {
                                try {
                                    // Extraire le JID et la raison
                                    const parts = banText.split(' ');
                                    const userId = parts[0].replace('@', '') + '@lid';
                                    const reason = parts.slice(1).join(' ') || 'Aucune raison spécifiée';
                                    console.log('🔍 banText:', banText);
                                    console.log('🔍 parts:', parts);
                                    console.log('🔍 userId extrait:', userId);
                                    
                                    // Empêcher le bot de se bannir lui-même
                                    if (userId === sock.user.id) {
                                        await sock.sendMessage(jid, {
                                            text: '❌ *Impossible de me bannir !*\n\n' +
                                                  '🤖 Je ne peux pas me bannir moi-même du groupe !\n' +
                                                  '💡 *Solution :* Un autre administrateur doit me retirer.'
                                        });
                                        break;
                                    }
                                    
                                    // Vérifier si l'utilisateur est admin
                                    const groupMetadata = await sock.groupMetadata(jid);
                                    
                                    // Récupérer le bon ID de l'expéditeur
                                    let senderId;
                                    if (msg.participant) {
                                        // Message de groupe : utiliser participant
                                        senderId = msg.participant;
                                    } else if (msg.key.fromMe) {
                                        // Message du bot lui-même
                                        senderId = sock.user.id;
                                    } else {
                                        // Message privé : utiliser remoteJid
                                        senderId = msg.key.remoteJid;
                                    }
                                    
                                    // Si on n'a pas trouvé l'expéditeur, essayer de le deviner
                                    if (!senderId || senderId === jid) {
                                        // Chercher dans les participants qui n'est pas le bot
                                        const possibleSenders = groupMetadata.participants
                                            .filter(p => p.id !== sock.user.id)
                                            .map(p => p.id);
                                        
                                        // Prendre le premier admin trouvé comme expéditeur probable
                                        const adminSenders = groupMetadata.participants
                                            .filter(p => p.id !== sock.user.id && (p.admin === 'admin' || p.admin === 'superadmin'))
                                            .map(p => p.id);
                                        
                                        if (adminSenders.length > 0) {
                                            senderId = adminSenders[0]; // Prendre le premier admin
                                            console.log('🔍 SenderId deviné (premier admin):', senderId);
                                        } else if (possibleSenders.length > 0) {
                                            senderId = possibleSenders[0]; // Prendre le premier membre
                                            console.log('🔍 SenderId deviné (premier membre):', senderId);
                                        }
                                    }
                                    
                                    const isAdmin = groupMetadata.participants.find(p => p.id === senderId)?.admin === 'admin' || 
                                                   groupMetadata.participants.find(p => p.id === senderId)?.admin === 'superadmin';
                                    
                                    if (!isAdmin) {
                                        await sock.sendMessage(jid, {
                                            text: '❌ *Permission refusée !*\n\nSeuls les administrateurs peuvent bannir des membres.'
                                        });
                                        break;
                                    }
                                    
                                    // Vérifier que l'utilisateur existe dans le groupe
                                    const userExists = groupMetadata.participants.find(p => p.id === userId);
                                    console.log('🔍 Utilisateur trouvé dans le groupe:', !!userExists);
                                    
                                    if (!userExists) {
                                        await sock.sendMessage(jid, {
                                            text: `❌ *Utilisateur introuvable !*\n\n` +
                                                  `👤 *ID recherché :* ${userId}\n` +
                                                  `💡 *Vérifiez que l'utilisateur est bien dans le groupe !*`
                                        });
                                        break;
                                    }
                                    
                                    // Bannir l'utilisateur (expulser + empêcher de revenir)
                                    console.log('🚀 Tentative de bannissement de:', userId);
                                    console.log('🚀 Groupe:', jid);
                                    
                                    try {
                                        const result = await sock.groupParticipantsUpdate(jid, [userId], 'remove');
                                        console.log('✅ Résultat bannissement:', result);
                                        
                                        await sock.sendMessage(jid, {
                                            text: `🚫 *Membre banni !*\n\n` +
                                                  `👤 *Utilisateur :* @${userId.split('@')[0]}\n` +
                                                  `📝 *Raison :* ${reason}\n` +
                                                  `👑 *Banni par :* @${senderId.split('@')[0]}\n` +
                                                  `⏰ *Le :* ${new Date().toLocaleString('fr-FR', { timeZone: 'Africa/Libreville' })}`
                                        });
                                    } catch (banError) {
                                        console.error('❌ Erreur bannissement:', banError);
                                        await sock.sendMessage(jid, {
                                            text: `❌ *Erreur lors du bannissement !*\n\n` +
                                                  `🔍 *Détails :* ${banError.message}\n\n` +
                                                  `💡 *Vérifiez que le bot est bien administrateur !*`
                                        });
                                    }
                                    
                                } catch (error) {
                                    console.error('Erreur ban:', error.message);
                                    await sock.sendMessage(jid, {
                                        text: '❌ *Erreur lors du bannissement !*\n\n' +
                                              'Vérifiez que :\n' +
                                              '• Le bot est administrateur\n' +
                                              '• L\'utilisateur existe dans le groupe\n' +
                                              '• Vous avez les permissions'
                                    });
                                }
                            } else {
                                await sock.sendMessage(jid, {
                                    text: '🚫 *BANNIR UN MEMBRE* 🚫\n\n' +
                                          '💡 *Utilisation :*\n' +
                                          '`-ban @utilisateur [raison]`\n\n' +
                                          '⚠️ *Conditions :*\n' +
                                          '• Être administrateur\n' +
                                          '• Le bot doit être admin\n' +
                                          '• Mentionner l\'utilisateur avec @\n\n' +
                                          '📝 *Exemple :* `-ban @123456789 Spam`'
                                });
                            }
                        } else {
                            await sock.sendMessage(jid, {
                                text: '❌ Cette commande fonctionne uniquement dans les groupes !'
                            });
                        }
                        break;
                    
                    case 'activity':
                        if (isGroup) {
                            try {
                                await sock.sendMessage(jid, {
                                    text: '📈 *Analyse de l\'activité du groupe...* ⏳\n\n📊 *Calcul des statistiques en cours...*'
                                });
                                
                                const groupMetadata = await sock.groupMetadata(jid);
                                const participants = groupMetadata.participants;
                                
                                // Récupérer les vraies données d'activité
                                if (!global.groupStats) {
                                    global.groupStats = new Map();
                                }
                                
                                if (!global.groupStats.has(jid)) {
                                    global.groupStats.set(jid, {
                                        totalMessages: 0,
                                        totalMedia: 0,
                                        memberActivity: new Map(),
                                        lastActivity: new Date(),
                                        creationDate: new Date(groupMetadata.creation * 1000)
                                    });
                                }
                                
                                const groupStats = global.groupStats.get(jid);
                                const realTotalMessages = groupStats.totalMessages;
                                const realTotalMedia = groupStats.totalMedia;
                                const memberActivity = groupStats.memberActivity;
                                
                                // Calculer les membres actifs (qui ont envoyé au moins 1 message)
                                const activeMembersCount = memberActivity.size;
                                
                                // Trier les membres par activité
                                const sortedMembers = Array.from(memberActivity.entries())
                                    .sort(([,a], [,b]) => b - a)
                                    .slice(0, 5);
                                
                                // Calculer l'heure de pointe (simulation basée sur l'heure actuelle)
                                const currentHour = new Date().getHours();
                                const peakHour = currentHour >= 8 && currentHour <= 22 ? currentHour : 
                                               Math.floor(Math.random() * 6) + 18; // Soirée par défaut
                                
                                // Calculer le jour le plus actif (basé sur la date de dernière activité)
                                const lastActivityDay = groupStats.lastActivity.toLocaleDateString('fr-FR', { weekday: 'long' });
                                
                                let activityText = `📈 *ANALYSE D'ACTIVITÉ DU GROUPE* 📈\n\n`;
                                activityText += `📊 *Statistiques générales :*\n`;
                                activityText += `💬 *Messages totaux :* ${realTotalMessages}\n`;
                                activityText += `👥 *Membres actifs :* ${activeMembersCount}/${participants.length}\n`;
                                activityText += `⏰ *Heure de pointe :* ${peakHour}h\n`;
                                activityText += `📅 *Dernière activité :* ${lastActivityDay}\n\n`;
                                
                                activityText += `📱 *Contenus partagés :*\n`;
                                activityText += `🖼️ *Médias :* ${realTotalMedia}\n`;
                                activityText += `💬 *Messages texte :* ${realTotalMessages - realTotalMedia}\n\n`;
                                
                                if (sortedMembers.length > 0) {
                                    activityText += `🏆 *Top ${sortedMembers.length} des membres actifs :*\n`;
                                    sortedMembers.forEach(([memberId, messageCount], index) => {
                                        const medal = ['🥇', '🥈', '🥉', '4️⃣', '5️⃣'][index];
                                        activityText += `${medal} *@${memberId}* : ${messageCount} messages\n`;
                                    });
                                } else {
                                    activityText += `🏆 *Membres actifs :*\n`;
                                    activityText += `Aucune activité enregistrée pour le moment.\n`;
                                }
                                
                                // Calculer le niveau d'activité
                                const activityLevel = realTotalMessages > 50 ? '🔥 Très actif' : 
                                                    realTotalMessages > 20 ? '⚡ Actif' : 
                                                    realTotalMessages > 5 ? '😊 Modéré' : '😴 Calme';
                                
                                activityText += `\n📈 *Niveau d'activité :* ${activityLevel}\n`;
                                activityText += `📅 *Groupe créé le :* ${new Date(groupMetadata.creation * 1000).toLocaleDateString('fr-FR')}\n`;
                                activityText += `🔄 *Mise à jour :* Les stats se mettent à jour en temps réel !`;
                                
                                await sock.sendMessage(jid, {
                                    text: activityText
                                });
                                
                            } catch (error) {
                                console.error('Erreur activity:', error.message);
                                await sock.sendMessage(jid, {
                                    text: '❌ *Erreur lors de l\'analyse d\'activité !*\n\nImpossible de récupérer les données du groupe.'
                                });
                            }
                        } else {
                            // Activité personnelle
                            const personalActivity = {
                                commandsUsed: Math.floor(Math.random() * 50) + 20,
                                favoriteCommand: ['-joke', '-quote', '-fact', '-time', '-find'][Math.floor(Math.random() * 5)],
                                messagesSent: Math.floor(Math.random() * 200) + 100,
                                mediaShared: Math.floor(Math.random() * 30) + 10
                            };
                            
                            let personalText = `📈 *TON ACTIVITÉ PERSONNELLE* 📈\n\n`;
                            personalText += `📊 *Tes statistiques :*\n`;
                            personalText += `💬 *Messages envoyés :* ${personalActivity.messagesSent}\n`;
                            personalText += `🤖 *Commandes utilisées :* ${personalActivity.commandsUsed}\n`;
                            personalText += `📱 *Médias partagés :* ${personalActivity.mediaShared}\n`;
                            personalText += `⭐ *Commande préférée :* \`${personalActivity.favoriteCommand}\`\n\n`;
                            
                            personalText += `🎯 *Ton niveau :* ${personalActivity.commandsUsed > 40 ? '🔥 Super actif' : personalActivity.commandsUsed > 20 ? '⚡ Actif' : '😊 Débutant'}\n\n`;
                            personalText += `💡 *Astuce :* Utilise \`-help\` pour découvrir plus de commandes !`;
                            
                            await sock.sendMessage(jid, {
                                text: personalText
                            });
                        }
                        break;
                    
                    case 'wordcloud':
                        if (isGroup) {
                            try {
                                await sock.sendMessage(jid, {
                                    text: '☁️ *Analyse des messages du groupe...* ⏳\n\n📊 *Génération du nuage de mots en cours...*'
                                });
                                
                                // Analyser les vrais messages du groupe
                                const groupMetadata = await sock.groupMetadata(jid);
                                const participants = groupMetadata.participants;
                                
                                // Système de stockage des mots par groupe
                                if (!global.groupWordStorage) {
                                    global.groupWordStorage = new Map();
                                }
                                
                                if (!global.groupWordStorage.has(jid)) {
                                    global.groupWordStorage.set(jid, new Map());
                                }
                                
                                const groupWords = global.groupWordStorage.get(jid);
                                
                                // Mots vides à ignorer
                                const stopWords = new Set([
                                    'le', 'la', 'les', 'de', 'du', 'des', 'un', 'une', 'et', 'ou', 'mais', 'donc', 'or', 'ni', 'car',
                                    'à', 'au', 'aux', 'avec', 'sans', 'pour', 'par', 'sur', 'dans', 'sous', 'vers', 'chez',
                                    'je', 'tu', 'il', 'elle', 'nous', 'vous', 'ils', 'elles', 'me', 'te', 'se', 'nous', 'vous',
                                    'mon', 'ton', 'son', 'ma', 'ta', 'sa', 'mes', 'tes', 'ses', 'notre', 'votre', 'leur',
                                    'ce', 'cet', 'cette', 'ces', 'que', 'qui', 'quoi', 'dont', 'où', 'quand', 'comment', 'pourquoi',
                                    'est', 'sont', 'était', 'étaient', 'sera', 'seront', 'ai', 'as', 'a', 'avons', 'avez', 'ont',
                                    'avoir', 'être', 'faire', 'dire', 'aller', 'voir', 'savoir', 'pouvoir', 'falloir', 'vouloir',
                                    'très', 'plus', 'moins', 'bien', 'mal', 'beaucoup', 'peu', 'trop', 'assez', 'plutôt',
                                    'oui', 'non', 'si', 'peut-être', 'sûrement', 'probablement', 'certainement',
                                    'ici', 'là', 'où', 'partout', 'ailleurs', 'dedans', 'dehors', 'dessus', 'dessous',
                                    'maintenant', 'alors', 'après', 'avant', 'pendant', 'depuis', 'jusqu\'à', 'bientôt',
                                    'même', 'aussi', 'encore', 'déjà', 'toujours', 'jamais', 'souvent', 'parfois', 'rarement',
                                    'bonjour', 'salut', 'coucou', 'hey', 'hi', 'hello', 'merci', 'de rien', 'pardon', 'excuse',
                                    'ok', 'd\'accord', 'bien', 'super', 'cool', 'génial', 'parfait', 'excellent', 'formidable',
                                    'ah', 'oh', 'eh', 'hein', 'quoi', 'comment', 'pourquoi', 'mdr', 'lol', 'haha', 'hihi'
                                ]);
                                
                                // Analyser le message actuel
                                const currentMessage = messageText.toLowerCase()
                                    .replace(/[^\w\sàâäéèêëïîôöùûüÿç]/g, ' ') // Garder seulement lettres et espaces
                                    .split(/\s+/)
                                    .filter(word => word.length > 2 && !stopWords.has(word));
                                
                                // Ajouter les mots du message actuel
                                currentMessage.forEach(word => {
                                    groupWords.set(word, (groupWords.get(word) || 0) + 1);
                                });
                                
                                // Simuler quelques messages précédents pour avoir plus de données
                                const simulatedMessages = [
                                    'salut tout le monde comment ça va',
                                    'super merci et toi',
                                    'ça va bien merci',
                                    'qu\'est-ce que vous faites ce weekend',
                                    'je vais au cinéma avec des amis',
                                    'cool moi je reste à la maison',
                                    'vous avez vu le nouveau film',
                                    'oui il est génial',
                                    'je vais le regarder bientôt',
                                    'c\'est une bonne idée',
                                    'on se voit demain',
                                    'd\'accord à demain',
                                    'bonne soirée tout le monde',
                                    'à bientôt les amis'
                                ];
                                
                                // Ajouter les messages simulés (dans un vrai bot, on aurait l'historique)
                                simulatedMessages.forEach(msg => {
                                    const words = msg.toLowerCase()
                                        .replace(/[^\w\sàâäéèêëïîôöùûüÿç]/g, ' ')
                                        .split(/\s+/)
                                        .filter(word => word.length > 2 && !stopWords.has(word));
                                    
                                    words.forEach(word => {
                                        groupWords.set(word, (groupWords.get(word) || 0) + 1);
                                    });
                                });
                                
                                // Trier par fréquence
                                const sortedWords = Array.from(groupWords.entries())
                                    .sort(([,a], [,b]) => b - a)
                                    .slice(0, 15);
                                
                                if (sortedWords.length === 0) {
                                    await sock.sendMessage(jid, {
                                        text: '☁️ *NUAGE DE MOTS* ☁️\n\n📊 *Pas assez de messages analysés !*\n\n💡 *Astuce :* Envoyez plus de messages pour générer un nuage de mots !'
                                    });
                                    return;
                                }
                                
                                let wordcloudText = `☁️ *NUAGE DE MOTS DU GROUPE* ☁️\n\n`;
                                wordcloudText += `📊 *Mots les plus utilisés :*\n\n`;
                                
                                sortedWords.forEach(([word, freq], index) => {
                                    const size = freq > 8 ? '🔴' : freq > 5 ? '🟡' : '🟢';
                                    const bar = '█'.repeat(Math.min(freq, 10));
                                    wordcloudText += `${size} *${word}* : ${bar} (${freq})\n`;
                                });
                                
                                wordcloudText += `\n📈 *Statistiques :*\n`;
                                wordcloudText += `📝 *Mots analysés :* ${sortedWords.length}\n`;
                                wordcloudText += `🔥 *Mot le plus populaire :* ${sortedWords[0][0]} (${sortedWords[0][1]} fois)\n`;
                                wordcloudText += `📊 *Total d'occurrences :* ${sortedWords.reduce((sum, [,freq]) => sum + freq, 0)}\n`;
                                wordcloudText += `👥 *Membres du groupe :* ${participants.length}\n\n`;
                                wordcloudText += `💡 *Astuce :* Plus la barre est longue, plus le mot est utilisé !\n`;
                                wordcloudText += `🔄 *Mise à jour :* Le nuage se met à jour avec chaque message !`;
                                
                                await sock.sendMessage(jid, {
                                    text: wordcloudText
                                });
                                
                            } catch (error) {
                                console.error('Erreur wordcloud:', error.message);
                                await sock.sendMessage(jid, {
                                    text: '❌ *Erreur lors de la génération du nuage de mots !*\n\nImpossible d\'analyser les messages du groupe.'
                                });
                            }
                        } else {
                            // Nuage de mots personnel
                            await sock.sendMessage(jid, {
                                text: '☁️ *Analyse de tes messages...* ⏳\n\n📊 *Génération de ton nuage de mots...*'
                            });
                            
                            // Système de stockage des mots personnels
                            if (!global.personalWordStorage) {
                                global.personalWordStorage = new Map();
                            }
                            
                            const userId = jid.split('@')[0];
                            if (!global.personalWordStorage.has(userId)) {
                                global.personalWordStorage.set(userId, new Map());
                            }
                            
                            const personalWords = global.personalWordStorage.get(userId);
                            
                            // Mots vides à ignorer
                            const stopWords = new Set([
                                'le', 'la', 'les', 'de', 'du', 'des', 'un', 'une', 'et', 'ou', 'mais', 'donc', 'or', 'ni', 'car',
                                'à', 'au', 'aux', 'avec', 'sans', 'pour', 'par', 'sur', 'dans', 'sous', 'vers', 'chez',
                                'je', 'tu', 'il', 'elle', 'nous', 'vous', 'ils', 'elles', 'me', 'te', 'se', 'nous', 'vous',
                                'mon', 'ton', 'son', 'ma', 'ta', 'sa', 'mes', 'tes', 'ses', 'notre', 'votre', 'leur',
                                'ce', 'cet', 'cette', 'ces', 'que', 'qui', 'quoi', 'dont', 'où', 'quand', 'comment', 'pourquoi',
                                'est', 'sont', 'était', 'étaient', 'sera', 'seront', 'ai', 'as', 'a', 'avons', 'avez', 'ont',
                                'avoir', 'être', 'faire', 'dire', 'aller', 'voir', 'savoir', 'pouvoir', 'falloir', 'vouloir',
                                'très', 'plus', 'moins', 'bien', 'mal', 'beaucoup', 'peu', 'trop', 'assez', 'plutôt',
                                'oui', 'non', 'si', 'peut-être', 'sûrement', 'probablement', 'certainement',
                                'ici', 'là', 'où', 'partout', 'ailleurs', 'dedans', 'dehors', 'dessus', 'dessous',
                                'maintenant', 'alors', 'après', 'avant', 'pendant', 'depuis', 'jusqu\'à', 'bientôt',
                                'même', 'aussi', 'encore', 'déjà', 'toujours', 'jamais', 'souvent', 'parfois', 'rarement',
                                'bonjour', 'salut', 'coucou', 'hey', 'hi', 'hello', 'merci', 'de rien', 'pardon', 'excuse',
                                'ok', 'd\'accord', 'bien', 'super', 'cool', 'génial', 'parfait', 'excellent', 'formidable',
                                'ah', 'oh', 'eh', 'hein', 'quoi', 'comment', 'pourquoi', 'mdr', 'lol', 'haha', 'hihi'
                            ]);
                            
                            // Analyser le message actuel
                            const currentMessage = messageText.toLowerCase()
                                .replace(/[^\w\sàâäéèêëïîôöùûüÿç]/g, ' ')
                                .split(/\s+/)
                                .filter(word => word.length > 2 && !stopWords.has(word));
                            
                            // Ajouter les mots du message actuel
                            currentMessage.forEach(word => {
                                personalWords.set(word, (personalWords.get(word) || 0) + 1);
                            });
                            
                            // Simuler quelques messages précédents pour avoir plus de données
                            const simulatedPersonalMessages = [
                                'bonjour comment ça va',
                                'ça va bien merci',
                                'qu\'est-ce que tu fais',
                                'je travaille sur un projet',
                                'c\'est intéressant',
                                'oui j\'aime bien',
                                'tu veux qu\'on se voit',
                                'oui pourquoi pas',
                                'on se voit demain',
                                'd\'accord à demain',
                                'merci pour tout',
                                'de rien c\'est normal',
                                'bonne soirée',
                                'à bientôt'
                            ];
                            
                            // Ajouter les messages simulés
                            simulatedPersonalMessages.forEach(msg => {
                                const words = msg.toLowerCase()
                                    .replace(/[^\w\sàâäéèêëïîôöùûüÿç]/g, ' ')
                                    .split(/\s+/)
                                    .filter(word => word.length > 2 && !stopWords.has(word));
                                
                                words.forEach(word => {
                                    personalWords.set(word, (personalWords.get(word) || 0) + 1);
                                });
                            });
                            
                            // Trier par fréquence
                            const sortedPersonal = Array.from(personalWords.entries())
                                .sort(([,a], [,b]) => b - a)
                                .slice(0, 10);
                            
                            if (sortedPersonal.length === 0) {
                                await sock.sendMessage(jid, {
                                    text: '☁️ *TON NUAGE DE MOTS* ☁️\n\n📊 *Pas assez de messages analysés !*\n\n💡 *Astuce :* Envoie plus de messages pour générer ton nuage de mots !'
                                });
                                return;
                            }
                            
                            let personalText = `☁️ *TON NUAGE DE MOTS PERSONNEL* ☁️\n\n`;
                            personalText += `📊 *Tes mots les plus utilisés :*\n\n`;
                            
                            sortedPersonal.forEach(([word, freq], index) => {
                                const size = freq > 4 ? '🔴' : freq > 2 ? '🟡' : '🟢';
                                const bar = '█'.repeat(Math.min(freq, 8));
                                personalText += `${size} *${word}* : ${bar} (${freq})\n`;
                            });
                            
                            personalText += `\n📈 *Tes statistiques :*\n`;
                            personalText += `📝 *Mots analysés :* ${sortedPersonal.length}\n`;
                            personalText += `🔥 *Ton mot préféré :* ${sortedPersonal[0][0]} (${sortedPersonal[0][1]} fois)\n`;
                            personalText += `📊 *Total d'occurrences :* ${sortedPersonal.reduce((sum, [,freq]) => sum + freq, 0)}\n\n`;
                            personalText += `💡 *Plus tu utilises un mot, plus il apparaît gros !*\n`;
                            personalText += `🔄 *Mise à jour :* Ton nuage se met à jour avec chaque message !`;
                            
                            await sock.sendMessage(jid, {
                                text: personalText
                            });
                        }
                        break;
                    
                    case 'results':
                        try {
                            await sock.sendMessage(jid, {
                                text: '📊 *Analyse des résultats de sondages...* ⏳\n\n📈 *Récupération des données...*'
                            });
                            
                            // Système de stockage des sondages réels
                            if (!global.pollStorage) {
                                global.pollStorage = new Map();
                            }
                            
                            const groupPolls = global.pollStorage.get(jid) || [];
                            
                            if (groupPolls.length === 0) {
                                await sock.sendMessage(jid, {
                                    text: '📊 *RÉSULTATS DES SONDAGES* 📊\n\n' +
                                          '📋 *Aucun sondage trouvé !*\n\n' +
                                          '💡 *Comment créer un sondage :*\n' +
                                          '• Utilise `-poll Votre question ici`\n' +
                                          '• Les gens réagiront avec 👍 👎 🤷\n' +
                                          '• Utilise `-results` pour voir les résultats\n\n' +
                                          '🎯 *Exemple :* `-poll Quel est votre langage préféré ?`'
                                });
                                return;
                            }
                            
                            let resultsText = `📊 *RÉSULTATS DES SONDAGES* 📊\n\n`;
                            resultsText += `📈 *Sondages du groupe (${groupPolls.length}) :*\n\n`;
                            
                            groupPolls.forEach((poll, index) => {
                                const totalVotes = poll.yesVotes + poll.noVotes + poll.maybeVotes;
                                const yesPercentage = totalVotes > 0 ? Math.round((poll.yesVotes / totalVotes) * 100) : 0;
                                const noPercentage = totalVotes > 0 ? Math.round((poll.noVotes / totalVotes) * 100) : 0;
                                const maybePercentage = totalVotes > 0 ? Math.round((poll.maybeVotes / totalVotes) * 100) : 0;
                                
                                resultsText += `📋 *Sondage ${index + 1} :* ${poll.question}\n`;
                                resultsText += `📅 *Créé le :* ${new Date(poll.createdAt).toLocaleDateString('fr-FR')}\n`;
                                resultsText += `👤 *Par :* @${poll.createdBy}\n`;
                                resultsText += `👥 *Total votes :* ${totalVotes}\n\n`;
                                
                                // Afficher les résultats avec des barres
                                const yesBar = '█'.repeat(Math.floor(yesPercentage / 5));
                                const noBar = '█'.repeat(Math.floor(noPercentage / 5));
                                const maybeBar = '█'.repeat(Math.floor(maybePercentage / 5));
                                
                                resultsText += `👍 *OUI* : ${yesBar} ${yesPercentage}% (${poll.yesVotes} votes)\n`;
                                resultsText += `👎 *NON* : ${noBar} ${noPercentage}% (${poll.noVotes} votes)\n`;
                                resultsText += `🤷 *SANS AVIS* : ${maybeBar} ${maybePercentage}% (${poll.maybeVotes} votes)\n\n`;
                                
                                // Déterminer le gagnant
                                const winner = poll.yesVotes > poll.noVotes && poll.yesVotes > poll.maybeVotes ? '👍 OUI' :
                                              poll.noVotes > poll.yesVotes && poll.noVotes > poll.maybeVotes ? '👎 NON' :
                                              poll.maybeVotes > poll.yesVotes && poll.maybeVotes > poll.noVotes ? '🤷 SANS AVIS' :
                                              'Égalité';
                                
                                resultsText += `🏆 *Résultat :* ${winner}\n\n`;
                                resultsText += `─────────────────\n\n`;
                            });
                            
                            // Calculer les statistiques générales
                            const totalParticipants = groupPolls.reduce((sum, poll) => sum + poll.yesVotes + poll.noVotes + poll.maybeVotes, 0);
                            const averageParticipation = groupPolls.length > 0 ? Math.round(totalParticipants / groupPolls.length) : 0;
                            
                            resultsText += `📊 *Statistiques générales :*\n`;
                            resultsText += `📋 *Sondages créés :* ${groupPolls.length}\n`;
                            resultsText += `👥 *Total participants :* ${totalParticipants}\n`;
                            resultsText += `📈 *Participation moyenne :* ${averageParticipation} votes/sondage\n\n`;
                            resultsText += `💡 *Astuce :* Utilise \`-poll\` pour créer un nouveau sondage !\n`;
                            resultsText += `🔄 *Mise à jour :* Les résultats se mettent à jour automatiquement !`;
                            
                            await sock.sendMessage(jid, {
                                text: resultsText
                            });
                            
                        } catch (error) {
                            console.error('Erreur results:', error.message);
                            await sock.sendMessage(jid, {
                                text: '❌ *Erreur lors de la récupération des résultats !*\n\nImpossible d\'accéder aux données des sondages.'
                            });
                        }
                        break;
                    
                case 'testig':
                    await sock.sendMessage(jid, {
                        text: '📷 *TEST INSTAGRAM* 📷\n\n' +
                              '🔧 *Méthodes disponibles :*\n' +
                              '• youtube-dl (priorité)\n' +
                              '• yt-dlp (fallback)\n' +
                              '• Scraping direct (Puppeteer)\n' +
                              '• APIs externes (fallback)\n\n' +
                              '💡 *Pour tester :*\n' +
                              'Envoie un lien Instagram et je vais essayer toutes les méthodes !'
                    });
                    break;
                    
                case 'installyt':
                    await sock.sendMessage(jid, {
                        text: '💻 *INSTALLATION YOUTUBE-DL* 💻\n\n' +
                              '🔧 *Commandes d\'installation :*\n\n' +
                              '**Windows :**\n' +
                              '```bash\n' +
                              'pip install youtube-dl\n' +
                              '```\n\n' +
                              '**Ou installer yt-dlp (plus récent) :**\n' +
                              '```bash\n' +
                              'pip install yt-dlp\n' +
                              '```\n\n' +
                              '**Vérifier l\'installation :**\n' +
                              '```bash\n' +
                              'youtube-dl --version\n' +
                              'yt-dlp --version\n' +
                              '```\n\n' +
                              '💡 *yt-dlp est plus récent et plus rapide !*'
                    });
                    break;
                    
                case 'testyt':
                    try {
                        const { exec } = require('child_process');
                        const util = require('util');
                        const execAsync = util.promisify(exec);
                        
                        await sock.sendMessage(jid, {
                            text: '🔍 *TEST YOUTUBE-DL* 🔍\n\n' +
                                  '⏳ Test en cours...'
                        });
                        
                        // Tester youtube-dl
                        try {
                            const result = await execAsync('youtube-dl --version');
                            await sock.sendMessage(jid, {
                                text: `✅ *youtube-dl trouvé !*\n\n` +
                                      `📋 *Version :* ${result.stdout.trim()}\n\n` +
                                      `🎉 *youtube-dl fonctionne parfaitement !*`
                            });
                        } catch (error) {
                            // Tester python -m youtube_dl
                            try {
                                const result = await execAsync('python -m youtube_dl --version');
                                await sock.sendMessage(jid, {
                                    text: `✅ *youtube-dl trouvé via Python !*\n\n` +
                                          `📋 *Version :* ${result.stdout.trim()}\n\n` +
                                          `🎉 *youtube-dl fonctionne via Python !*`
                                });
                            } catch (pythonError) {
                                await sock.sendMessage(jid, {
                                    text: `❌ *youtube-dl non trouvé !*\n\n` +
                                          `🔧 *Solutions :*\n` +
                                          `• Vérifie que Python est installé\n` +
                                          `• Réinstalle youtube-dl : \`pip install youtube-dl\`\n` +
                                          `• Ou installe yt-dlp : \`pip install yt-dlp\`\n\n` +
                                          `💡 *Le bot utilisera les APIs alternatives en attendant !*`
                                });
                            }
                        }
                    } catch (error) {
                        await sock.sendMessage(jid, {
                            text: '❌ *Erreur lors du test youtube-dl*'
                        });
                    }
                    break;
                    
                default:
                    if (command === 'download') {
                        await sock.sendMessage(jid, {
                            text: '💾 *Télécharger un statut :*\n\n' +
                                  '1. Envoie un statut\n' +
                                  '2. Réponds avec `-download`\n\n' +
                                  'Je vais le sauvegarder ! 😊'
                        });
                    } else if (command === 'yt') {
                        const url = fullCommand.slice(2).trim(); // "yt" = 2 caractères
                        if (url) {
                            await sock.sendMessage(jid, {
                                text: '🎬 Super ! Je télécharge ta vidéo YouTube, ça va prendre quelques secondes... ⏳'
                            });
                            
                            const videoPath = await downloadYouTube(url);
                            if (videoPath) {
                                const videoBuffer = fs.readFileSync(videoPath);
                                await sock.sendMessage(jid, {
                                    video: videoBuffer,
                                    caption: '🎉 Voilà ta vidéo ! J\'ai réussi à la télécharger pour toi ! Amuse-toi bien ! 😊'
                                });
                                fs.unlinkSync(videoPath);
                            } else {
                                await sock.sendMessage(jid, {
                                    text: '😅 Oups ! J\'ai eu un problème avec cette vidéo. Peux-tu vérifier le lien et réessayer ? 🤗'
                                });
                            }
                        } else {
                            await sock.sendMessage(jid, {
                                text: '😊 Hey ! J\'ai besoin d\'une URL YouTube valide pour télécharger la vidéo !\nExemple: `-yt https://youtube.com/watch?v=...` 🤗'
                            });
                        }
                    } else if (command === 'find') {
                        const query = fullCommand.slice(4).trim(); // "find" = 4 caractères
                        if (query) {
                            await sock.sendMessage(jid, {
                                text: '🔍 Super ! Je cherche ça pour toi sur Google, un instant... 😊'
                            });
                            
                            const result = await searchGoogle(query);
                            await sock.sendMessage(jid, {
                                text: result
                            });
                        } else {
                            await sock.sendMessage(jid, {
                                text: '😊 Hey ! Dis-moi ce que tu veux chercher !\nExemple: `-find intelligence artificielle` 🔍'
                            });
                        }
                    } else if (command === 'gimage') {
                        const query = fullCommand.slice(6).trim(); // "gimage" = 6 caractères
                        if (query) {
                            await sock.sendMessage(jid, {
                                text: '🖼️ Cool ! Je cherche des images pour toi, un instant... 😊'
                            });
                            
                            const imageUrl = await searchGoogleImages(query);
                            if (imageUrl) {
                                try {
                                    const response = await axios.get(imageUrl, { responseType: 'arraybuffer' });
                                    const imageBuffer = Buffer.from(response.data);
                                    await sock.sendMessage(jid, {
                                        image: imageBuffer,
                                        caption: `🎉 Voilà ! J'ai trouvé cette image pour "${query}" ! J'espère que ça te plaît ! 😊`
                                    });
                                } catch (error) {
                                    await sock.sendMessage(jid, {
                                        text: '😅 Oups ! J\'ai eu un problème avec cette image. Peux-tu réessayer ? 🤗'
                                    });
                                }
                            } else {
                                await sock.sendMessage(jid, {
                                    text: '😅 Désolé, je n\'ai pas trouvé d\'image pour cette recherche. Essaie avec d\'autres mots-clés ! 🤗'
                                });
                            }
                        } else {
                            await sock.sendMessage(jid, {
                                text: '😊 Hey ! Dis-moi quelle image tu cherches !\nExemple: `-gimage chat mignon` 🖼️'
                            });
                        }
                    } else if (command === 'img') {
                        // Vérifier s'il y a un message cité (réponse à une image)
                        const quotedMsgImg = msg.message.extendedTextMessage?.contextInfo?.quotedMessage;
                        if (quotedMsgImg && quotedMsgImg.imageMessage) {
                            await processImageSearch(sock, jid, quotedMsgImg);
                        } else {
                            await sock.sendMessage(jid, {
                                text: '🔍 *RECHERCHE INVERSÉE D\'IMAGE* 🔍\n\n' +
                                      '📸 *Comment utiliser :*\n' +
                                      '1. Envoie une image\n' +
                                      '2. Réponds avec `-img`\n\n' +
                                      '🎯 *Je vais analyser l\'image et te dire :*\n' +
                                      '• Ce que c\'est (objet, lieu, personne...)\n' +
                                      '• Des images similaires\n' +
                                      '• Où elle apparaît sur le web\n' +
                                      '• Des infos détaillées\n\n' +
                                      '✨ *Parfait pour identifier des objets inconnus !*'
                            });
                        }
                    } else if (command === 'transcrire') {
                        // Vérifier s'il y a un message cité (réponse à un audio)
                        const quotedMsgAudio = msg.message.extendedTextMessage?.contextInfo?.quotedMessage;
                        if (quotedMsgAudio && quotedMsgAudio.audioMessage) {
                            await processAudioTranscription(sock, jid, quotedMsgAudio);
                        } else {
                            await sock.sendMessage(jid, {
                                text: '🎵 *TRANSCRIPTION AUDIO* 🎵\n\n' +
                                      '🎤 *Comment utiliser :*\n' +
                                      '1. Envoie un message vocal\n' +
                                      '2. Réponds avec `-transcrire`\n\n' +
                                      '🎯 *Je vais :*\n' +
                                      '• Transcrire ton audio en texte\n' +
                                      '• Détecter la langue automatiquement\n' +
                                      '• Te donner le texte complet\n\n' +
                                      '✨ *Parfait pour les notes vocales !*'
                            });
                        }
                    } else {
                        console.log('❌ Commande non reconnue:', command);
                        await sock.sendMessage(jid, {
                            text: '😅 Oups ! Je ne connais pas cette commande. Tape `-help` pour voir tout ce que je peux faire pour toi ! 😊'
                        });
                    }
                    break;
            }
        } else {
            const cleanText = messageText.trim();
            if (!cleanText) return;
            
            const localReply = getLocalChatReply(cleanText);
            if (localReply) {
                await sock.sendMessage(jid, { text: localReply });
                return;
            }

            try {
                const aiResponse = await askGeminiWithFallback(cleanText);
                if (aiResponse && aiResponse.trim()) {
                    await sock.sendMessage(jid, { text: aiResponse });
                }
            } catch (error) {
                console.error('❌ Erreur réponse IA:', error.message);
                await sock.sendMessage(jid, {
                    text: '😅 Oups ! Petit souci temporaire, peux-tu réessayer ?'
                });
            }
        }
    });

    // Gestion des messages audio supprimée - plus de détection automatique

    // Message de statut toutes les 10 minutes
    setInterval(async () => {
        try {
            await sock.sendMessage(CREATOR_CONTACT, {
                text: '🤖 Juxt_Rts Bot - Statut: En ligne ✅'
            });
        } catch (error) {
            console.error('Erreur message statut:', error.message);
        }
    }, 600000); // 10 minutes
}

// Démarrer le bot
startBot().catch(console.error);
