const fs = require('fs');
const path = require('path');

/**
 * Gestionnaire de fallback JSON pour les réponses informatiques
 * Utilisé quand Gemini AI n'est pas disponible ou échoue
 */
class FallbackHandler {
    constructor() {
        this.fallbackData = null;
        this.fallbackPath = process.env.FALLBACK_JSON_PATH || './fallback_responses.json';
        this.enabled = process.env.FALLBACK_ENABLED !== 'false';
        this.loadFallbackData();
    }

    /**
     * Charge les données de fallback depuis le fichier JSON
     */
    loadFallbackData() {
        try {
            if (fs.existsSync(this.fallbackPath)) {
                const data = fs.readFileSync(this.fallbackPath, 'utf8');
                this.fallbackData = JSON.parse(data);
                console.log('✅ Données de fallback chargées avec succès');
            } else {
                console.warn('⚠️ Fichier de fallback non trouvé:', this.fallbackPath);
            }
        } catch (error) {
            console.error('❌ Erreur lors du chargement du fallback:', error.message);
        }
    }

    /**
     * Recherche une réponse dans la base de connaissances JSON
     * @param {string} question - La question de l'utilisateur
     * @returns {string|null} - La réponse trouvée ou null
     */
    searchResponse(question) {
        if (!this.enabled || !this.fallbackData) {
            return null;
        }

        const normalizedQuestion = question.toLowerCase().trim();
        const bestMatch = this.findBestMatch(normalizedQuestion);
        
        if (bestMatch) {
            return this.formatResponse(bestMatch);
        }

        return null;
    }

    /**
     * Trouve la meilleure correspondance pour une question
     * @param {string} question - Question normalisée
     * @returns {object|null} - Meilleure correspondance trouvée
     */
    findBestMatch(question) {
        let bestMatch = null;
        let bestScore = 0;
        const threshold = this.fallbackData?.search_algorithm?.threshold || 0.3;

        // Parcourir toutes les catégories
        for (const [categoryName, category] of Object.entries(this.fallbackData.categories)) {
            for (const [subCategoryName, subCategory] of Object.entries(category)) {
                for (const [topicName, topic] of Object.entries(subCategory)) {
                    if (topic.questions && topic.responses) {
                        const score = this.calculateMatchScore(question, topic.questions);
                        
                        if (score > bestScore && score >= threshold) {
                            bestScore = score;
                            bestMatch = {
                                category: categoryName,
                                subCategory: subCategoryName,
                                topic: topicName,
                                responses: topic.responses,
                                score: score
                            };
                        }
                    }
                }
            }
        }

        return bestMatch;
    }

    /**
     * Calcule le score de correspondance entre une question et des mots-clés
     * @param {string} question - Question normalisée
     * @param {Array} keywords - Mots-clés à comparer
     * @returns {number} - Score de correspondance (0-1)
     */
    calculateMatchScore(question, keywords) {
        const questionWords = question.split(/\s+/);
        let totalMatches = 0;
        let totalKeywords = keywords.length;

        for (const keyword of keywords) {
            const keywordWords = keyword.toLowerCase().split(/\s+/);
            let keywordMatches = 0;

            for (const keywordWord of keywordWords) {
                for (const questionWord of questionWords) {
                    // Correspondance exacte
                    if (questionWord === keywordWord) {
                        keywordMatches += 2;
                        break;
                    }
                    // Correspondance partielle
                    else if (questionWord.includes(keywordWord) || keywordWord.includes(questionWord)) {
                        keywordMatches += 1;
                        break;
                    }
                }
            }

            // Score basé sur le pourcentage de correspondance
            const keywordScore = keywordMatches / keywordWords.length;
            totalMatches += keywordScore;
        }

        return totalMatches / totalKeywords;
    }

    /**
     * Formate la réponse finale
     * @param {object} match - Correspondance trouvée
     * @returns {string} - Réponse formatée
     */
    formatResponse(match) {
        const fallbackMessages = this.fallbackData?.fallback_messages || {};
        
        // Messages d'accueil plus chaleureux
        const greetings = [
            "Salut ! 😊 J'ai trouvé quelque chose d'intéressant pour toi :",
            "Hey ! 👋 Voici ce que je peux te dire sur ce sujet :",
            "Coucou ! 😄 J'ai des infos sympas à partager :",
            "Salut l'ami ! 🤗 Laisse-moi t'expliquer ça :",
            "Hello ! ✨ J'ai trouvé des infos utiles pour toi :"
        ];
        
        const randomGreeting = greetings[Math.floor(Math.random() * greetings.length)];
        let response = `${randomGreeting}\n\n`;
        
        // Ajouter des informations sur le sujet trouvé de manière plus naturelle
        response += `📚 **${this.formatCategoryName(match.category)} - ${this.formatCategoryName(match.subCategory)} - ${this.formatCategoryName(match.topic)}**\n\n`;
        
        // Ajouter les réponses de manière plus conversationnelle
        const maxResponses = this.fallbackData?.search_algorithm?.max_responses || 3;
        const responsesToShow = match.responses.slice(0, maxResponses);
        
        responsesToShow.forEach((resp, index) => {
            if (index === 0) {
                response += `💡 ${resp}\n\n`;
            } else {
                response += `🔹 ${resp}\n\n`;
            }
        });

        // Ajouter une note plus amicale
        const closingMessages = [
            "J'espère que ça t'aide ! N'hésite pas si tu as d'autres questions 😊",
            "Voilà ! J'espère que c'est clair pour toi. À bientôt ! 🤗",
            "J'espère que ces infos te sont utiles ! Bonne continuation ! ✨",
            "Voilà mon pote ! Si tu veux creuser plus, fais-moi signe ! 😄",
            "J'espère que ça répond à ta question ! À la prochaine ! 👋"
        ];
        
        const randomClosing = closingMessages[Math.floor(Math.random() * closingMessages.length)];
        response += `💭 *${randomClosing}*\n\n`;
        response += 'ℹ️ *Info : Cette réponse vient de ma base de connaissances. Pour des infos plus récentes, je te conseille de vérifier la doc officielle !*';

        return response;
    }

    /**
     * Formate un nom de catégorie pour l'affichage
     * @param {string} name - Nom de la catégorie
     * @returns {string} - Nom formaté
     */
    formatCategoryName(name) {
        return name.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase());
    }

    /**
     * Vérifie si le fallback est disponible
     * @returns {boolean} - True si disponible
     */
    isAvailable() {
        return this.enabled && this.fallbackData !== null;
    }

    /**
     * Obtient des statistiques sur la base de connaissances
     * @returns {object} - Statistiques
     */
    getStats() {
        if (!this.fallbackData) {
            return { categories: 0, topics: 0, responses: 0 };
        }

        let categories = 0;
        let topics = 0;
        let responses = 0;

        for (const category of Object.values(this.fallbackData.categories)) {
            categories++;
            for (const subCategory of Object.values(category)) {
                for (const topic of Object.values(subCategory)) {
                    if (topic.responses) {
                        topics++;
                        responses += topic.responses.length;
                    }
                }
            }
        }

        return { categories, topics, responses };
    }

    /**
     * Recharge les données de fallback
     */
    reload() {
        this.loadFallbackData();
    }
}

module.exports = FallbackHandler;
// Yassine sidiri