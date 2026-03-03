import OpenAI from 'openai'
import * as fs from 'fs'

const envFile = fs.readFileSync('.env.local', 'utf8')
const apiKeyMatch = envFile.match(/^DEEPSEEK_API_KEY=(.*)$/m)
const apiKey = apiKeyMatch ? apiKeyMatch[1].trim() : ''

const openai = new OpenAI({
    baseURL: 'https://api.deepseek.com',
    apiKey: apiKey
})

const tools: any = [
    {
        type: "function",
        function: {
            name: "manage_crm_profile",
            description: "OBLIGATOIRE au premier contact dès qu'on connait le prénom OU dès que le prospect donne des infos (âge, developpement web, niveau). Insère ou met à jour le profil dans la base.",
            parameters: {
                type: "object",
                properties: {
                    prenom: { type: "string" },
                    nom: { type: "string" },
                    age: { type: "string" },
                    profil_type: { type: "string", description: '\"Enfant\", \"Parent\", \"Pro\", \"Etudiant\"' },
                    interet_principal: { type: "string", description: 'Ex: Developpement web' },
                    niveau_actuel: { type: "string" },
                    disponibilite: { type: "string" },
                    objectif: { type: "string" },
                    budget_mentionne: { type: "string" },
                    objections: { type: "string" },
                    programme_recommande: { type: "string" },
                    statut_conversation: { type: "string", description: '\"Nouveau\"|\"Qualifie\"|\"Proposition faite\"|\"Interesse\"|\"Inscription\"|\"Froid\"' },
                    score_engagement: { type: "number", description: '0 à 100' },
                    notes: { type: "string" }
                },
                required: []
            }
        }
    }
]

async function run() {
    console.log("Starting model...")
    const messagesContext: any = JSON.parse(fs.readFileSync("dump.json", "utf8"))
    const response = await openai.chat.completions.create({
        model: "deepseek-chat",
        messages: messagesContext,
        tools: tools,
        temperature: 0.7,
    })

    const responseMessage = response.choices[0].message
    console.log('Result:', responseMessage.content)
    console.log('Tool Calls:', JSON.stringify(responseMessage.tool_calls, null, 2))
}

run().catch(console.error)
