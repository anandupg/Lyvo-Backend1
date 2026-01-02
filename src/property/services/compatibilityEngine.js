const { GoogleGenerativeAI } = require("@google/generative-ai");

/**
 * CompatibilityEngine Service
 * Handles deterministic behavioral scoring and AI-powered explanations.
 */
class CompatibilityEngine {
    constructor() {
        this.genAI = null;
        if (process.env.GEMINI_API_KEY) {
            this.genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
        }

        // Attribute mapping for normalized scoring (0-2)
        this.mapping = {
            smoking: { 'No': 2, 'Occasionally': 1, 'Yes': 0 },
            drinking: { 'No': 2, 'Socially': 1, 'Yes': 0 },
            cleanliness: { 'Neat Freak': 2, 'Average': 1, 'Messy': 0 },
            guests: { 'Never': 2, 'Rarely': 2, 'Weekends Only': 1, 'Often': 0 },
            sleepSchedule: { 'Before 10 PM': 2, 'Before 12 AM': 1, 'After 12 AM': 0 },
            occupation: { 'Student': 2, 'Professional': 1, 'Other': 0 },
            pets: { 'No': 2, 'Yes': 0 },
            food: { 'Vegetarian': 2, 'Vegan': 2, 'Eggetarian': 1, 'Non-Vegetarian': 0 }
        };
    }

    /**
     * Normalize an answer string to it's numeric value
     */
    normalize(attr, value) {
        if (attr === 'budget') {
            const val = parseInt(value);
            if (isNaN(val)) return 10000;
            return val;
        }
        if (!this.mapping[attr]) return 1; // Default to neutral if attribute unknown
        return this.mapping[attr][value] ?? 1;
    }

    /**
     * Calculate compatibility between seeker and one tenant
     */
    calculateIndividualScore(seekerAnswers, tenantAnswers) {
        let totalScore = 0;
        const attributes = Object.keys(this.mapping);
        const details = [];

        // Categorical Attributes
        attributes.forEach(attr => {
            const sVal = this.normalize(attr, seekerAnswers[attr]);
            const tVal = this.normalize(attr, tenantAnswers[attr]);

            const diff = Math.abs(sVal - tVal);
            const score = Math.max(0, 2 - diff);

            totalScore += score;
            details.push({
                attribute: attr,
                seekerValue: seekerAnswers[attr],
                tenantValue: tenantAnswers[attr],
                score: score
            });
        });

        // Budget Scoring (Weight: Same as one categorical question)
        const sBudget = this.normalize('budget', seekerAnswers.budget);
        const tBudget = this.normalize('budget', tenantAnswers.budget);
        const budgetDiff = Math.abs(sBudget - tBudget);
        // Score based on relative distance (max weight 2)
        // If budget difference is more than 10000, score is 0.
        const budgetScore = Math.max(0, 2 - (budgetDiff / 5000));
        totalScore += budgetScore;
        details.push({
            attribute: 'budget',
            seekerValue: seekerAnswers.budget,
            tenantValue: tenantAnswers.budget,
            score: Math.round(budgetScore * 10) / 10
        });

        const percentage = (totalScore / ((attributes.length + 1) * 2)) * 100;

        let label = "Low Match";
        if (percentage >= 80) label = "High Match";
        else if (percentage >= 60) label = "Moderate Match";

        return {
            percentage: Math.round(percentage),
            label,
            details
        };
    }

    /**
   * Check hard constraints (Gender, Smoking, Age)
   */
    checkHardConstraints(seeker, tenant) {
        // 1. Smoking (If seeker is strictly non-smoking, tenant must be Non-smoker)
        if (seeker.lifestyle?.smoking === 'No' && tenant.lifestyle?.smoking === 'Yes') {
            return { valid: false, reason: "Smoking preference mismatch" };
        }

        // 2. Gender restrictions 
        if (seeker.gender && tenant.gender && seeker.gender !== tenant.gender) {
            // Many users prefer same-gender roommates. If genders are different, label as mismatch.
            return { valid: false, reason: "Gender mismatch" };
        }

        // 3. Age Restrictions (Gap > 15 years might be a mismatch for some, but let's be flexible)
        if (seeker.age && tenant.age) {
            const ageDiff = Math.abs(seeker.age - tenant.age);
            if (ageDiff > 20) {
                return { valid: false, reason: "Significant age gap" };
            }
        }

        return { valid: true };
    }

    /**
     * Evaluate a room (Average of seeker-to-tenant scores)
     */
    async evaluateRoom(seeker, tenants, options = {}) {
        if (!tenants || tenants.length === 0) {
            return {
                overallScore: 100,
                label: "Perfect Start",
                tenantScores: [],
                lifestyleType: "Fresh Start",
                notes: "You're the first one here! You get to set the vibe."
            };
        }

        let totalPercentage = 0;
        const tenantScores = [];
        const scoresArray = [];

        for (const tenant of tenants) {
            // Hard Constraints check
            const constraint = this.checkHardConstraints(seeker, tenant);

            if (!constraint.valid) {
                tenantScores.push({
                    name: tenant.name,
                    compatibility: 0,
                    label: "Incompatible",
                    reason: constraint.reason
                });
                continue;
            }

            const score = this.calculateIndividualScore(seeker.lifestyle, tenant.lifestyle);
            tenantScores.push({
                userId: tenant.userId,
                name: tenant.name,
                compatibility: score.percentage,
                label: score.label,
                details: score.details
            });
            totalPercentage += score.percentage;
            scoresArray.push(score.percentage);
        }

        // Handle case where all tenants are incompatible
        if (scoresArray.length === 0) {
            return {
                overallScore: 0,
                label: "Incompatible",
                tenantScores,
                lifestyleType: "Mismatch",
                notes: "This room does not meet your hard constraints (Gender/Smoking/Age)."
            };
        }

        const overallScore = Math.round(totalPercentage / scoresArray.length);

        // Lifestyle Diversity Check (Mixed vs Similar)
        const minScore = Math.min(...scoresArray);
        const maxScore = Math.max(...scoresArray);
        const variance = maxScore - minScore;

        const lifestyleType = variance > 30 ? "Mixed Lifestyle Household" : "Similar Lifestyle Household";

        let label = "Low Match";
        if (overallScore >= 80) label = "High Match";
        else if (overallScore >= 60) label = "Moderate Match";

        // AI Generation for notes if API key available
        let notes = "Residents have different routines; communication is advised.";
        if (!options.skipAI && this.genAI) {
            try {
                notes = await this.generateAINotes(seeker, tenants, overallScore, lifestyleType);
            } catch (e) {
                console.error("AI Generation failed:", e);
            }
        } else if (overallScore >= 80) {
            notes = "Great match! Your lifestyles and habits align very well with the current residents.";
        }

        // Deterministic Breakdown
        const breakdown = this.generateDeterministicExplanation(seeker, tenants);

        return {
            overallScore,
            label,
            tenantScores,
            lifestyleType,
            notes,
            scoreBreakdown: breakdown
        };
    }

    async generateAINotes(seeker, tenants, score, type) {
        const model = this.genAI.getGenerativeModel({ model: "gemini-1.5-flash" });

        const prompt = `
      As a compatibility expert for a roommate matching platform, summarize why this seeker is a ${score}% match with this room (${type}).
      
      Seeker Profile: Age: ${seeker.age}, Gender: ${seeker.gender}, Lifestyle: ${JSON.stringify(seeker.lifestyle)}
      Current Tenants: ${JSON.stringify(tenants.map(t => ({ name: t.name, age: t.age, gender: t.gender, lifestyle: t.lifestyle })))}
      
      Provide a concise, friendly, 2-sentence summary of why they matched well or what the main differences are (e.g., sleep, cleanliness, budget, pets). 
      Be explainable, objective and fair. Do not use corporate jargon.
    `;

        const result = await model.generateContent(prompt);
        return result.response.text().trim();
    }

    /**
     * Generate deterministic pros/cons based on attribute scores
     */
    generateDeterministicExplanation(seeker, tenants) {
        const insights = { pros: [], cons: [], mixed: [] };
        const attributes = Object.keys(this.mapping);

        // Helper to format attribute name
        const formatAttr = (attr) => attr.charAt(0).toUpperCase() + attr.slice(1).replace(/([A-Z])/g, ' $1');

        if (!seeker.lifestyle) return insights;

        attributes.forEach(attr => {
            let totalAttrScore = 0;
            const sVal = this.normalize(attr, seeker.lifestyle[attr]);

            tenants.forEach(t => {
                const tVal = this.normalize(attr, t.lifestyle ? t.lifestyle[attr] : undefined);
                const diff = Math.abs(sVal - tVal);
                totalAttrScore += Math.max(0, 2 - diff);
            });

            const avgAttrScore = totalAttrScore / tenants.length; // 0 to 2

            if (avgAttrScore >= 1.5) {
                insights.pros.push(formatAttr(attr));
            } else if (avgAttrScore <= 0.8) {
                insights.cons.push(formatAttr(attr));
            } else {
                insights.mixed.push(formatAttr(attr));
            }
        });

        // Budget check
        const sBudget = this.normalize('budget', seeker.lifestyle.budget);
        let totalBudgetScore = 0;
        tenants.forEach(t => {
            const tBudget = this.normalize('budget', t.lifestyle ? t.lifestyle.budget : undefined);
            const budgetDiff = Math.abs(sBudget - tBudget);
            // Score based on relative distance (max weight 2)
            const budgetScore = Math.max(0, 2 - (budgetDiff / 5000));
            totalBudgetScore += budgetScore;
        });
        const avgBudgetScore = totalBudgetScore / tenants.length;
        if (avgBudgetScore >= 1.5) insights.pros.push('Budget');
        else if (avgBudgetScore <= 0.8) insights.cons.push('Budget');

        return insights;
    }
}

module.exports = new CompatibilityEngine();
