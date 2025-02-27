🍐 Perry AI Quest - Interactive Web3 Experience
Perry AI Quest is an interactive blockchain-based adventure that combines AI storytelling, puzzle-solving, and web3 integration. Players explore the mysterious "Green Mist" in Perry's digital garden, solving puzzles and uncovering the truth about the enigmatic L3M0N.

🌟 Project Overview
This application creates an immersive quest experience where users connect their wallet and interact with Perry, an AI entity, to navigate through an episodic narrative filled with puzzles and blockchain interactions.

Core Features:

Wallet Authentication: Secure MetaMask integration
Interactive Storytelling: Dynamic AI-generated narrative with multiple choices
Episodic Quest Structure: A 6-episode adventure with progressive difficulty
Puzzle Mechanics: Cryptographic challenges with blockchain elements
Token Economy: $PEAR token for in-game purchases and rewards
Web3 Integration: Blockchain interactions tied to quest progression

🔧 Tech Stack

Frontend: Vanilla JavaScript, HTML, CSS
Authentication: MetaMask wallet connect via AppKit and direct integration
AI Integration: OpenAI API for dynamic story generation
Database: PostgreSQL for user data and quest state persistence
Blockchain: EVM compatibility (Ethereum, Arbitrum)
Token System: $PEAR ERC-20 token

🚀 Getting Started
Prerequisites

Node.js (v14+)
PostgreSQL
MetaMask or compatible Web3 wallet
OpenAI API key

Installation

Clone the repository:
bashCopygit clone https://github.com/yourusername/perry-ai-quest.git

cd perry-ai-quest

Install dependencies:

npm install

Create a .env file in the project root:
DATABASE_URL=postgres://user:password@localhost:5432/perry_db
VITE_OPENAI_API_KEY=your_openai_api_key
VITE_REOWN_PROJECT_ID=your_reown_project_id

Initialize the database:
npm run db:init

Start the development server:
bnpm run dev


📖 Quest Structure
The "Green Mist" quest is structured into 6 episodes:

Episode 1: "First Traces" - Players discover initial signs of the mysterious mist
Episode 2: "Mist Thickens" - The mist spreads to central garden areas
Episode 3: "Secret Messages" - Mysterious inscriptions appear on trees
Episode 4: "Gates to the Thick" - A portal opens deep in the garden
Episode 5: "Signal Beyond the Mist" - Players discover a device with information about L3M0N
Episode 6: "Conclusion" - The final connection between the mist, the device, and L3M0N is revealed

🧩 Puzzle Mechanics
Puzzles in Perry AI Quest include:

Cryptographic challenges (Caesar, Vigenère, Base64 ciphers)
Logical puzzles and sequences
Blockchain-related challenges (transaction data, coordinates)
Hidden clues in the narrative

Players can use $PEAR tokens to purchase hints or access special areas.
🔄 AI Integration
The quest leverages OpenAI's API to:

Generate dynamic story continuations
Create contextual puzzles based on player progress
Offer personalized hints
Adapt the narrative based on player choices

AI prompts are configured in quest-prompts.js with templates for different storytelling needs.
💾 Data Architecture
User data and quest progress are stored in PostgreSQL with the following structure:

wallet_users: Stores wallet addresses, authentication tokens, and session data
Quest state is managed through the front-end and stored in localStorage

🧰 Core Components

main.js: Handles wallet authentication and connection
app.js: Main application initialization and event handling
quest-manager.js: Core quest logic and AI integration
quest-config.js: Configuration settings for the quest
quest-prompts.js: AI prompt templates
db.js: Database interaction

🔮 Future Enhancements

DAO Governance: Community voting on quest directions
NFT Integration: Exclusive rewards for quest completion
Multi-chain Support: Expand beyond Ethereum and Arbitrum
Multiplayer Features: Collaborative puzzle-solving
Advanced AI: More sophisticated storytelling with memory features

📄 License
This project is licensed under the MIT License - see the LICENSE file for details.
🤝 Contributing
Contributions are welcome! Please feel free to submit a Pull Request.

Fork the repository
Create your feature branch (git checkout -b feature/amazing-feature)
Commit your changes (git commit -m 'Add some amazing feature')
Push to the branch (git push origin feature/amazing-feature)
Open a Pull Request

📞 Contact
For questions or feedback, please open an issue on GitHub or reach out to the team at partners@perrythepear.com.

Built with 💜 by the Perry AI Quest team.
