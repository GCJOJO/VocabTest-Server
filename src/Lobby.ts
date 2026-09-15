import { LobbyOptions, LobbyMode } from "./LobbyOptions";
import { LobbyPlayer } from "./LobbyPlayer";
import { Constants } from "./Constants";
import { Utils } from "./Utils/Utils";
import { MapUtils } from "./Utils/MapUtils";

import { DatabaseConnection, Tables, type Word, type Verb, type Country } from "./DatabaseConnection";

enum LobbyState
{
    Waiting = 0,
    Playing = 1,
    WaitingForNextQuestion = 2,
    EndScreen = 3,
}

export class Lobby
{
    public id: string;
    public owner_id: string;
    public players: Map<string, LobbyPlayer> = new Map();
    public state: LobbyState = LobbyState.Waiting;
    public options: LobbyOptions = new LobbyOptions();

    private questions : { category: number, question: any }[] = [];
    private current_question_index : number = -1;
    private current_round_timer : number = 0;   
    private players_submitted_answer : number = 0;

    constructor(id: string, owner_id: string)
    {
        this.id = id;
        this.owner_id = owner_id;
    }

    public GetPlayerAmount() : number
    {
        return this.players.size;
    }

    public PlayerJoin(playerId: string, joiningWebsocket: WebSocket) : boolean
    {
        if (this.state != LobbyState.Waiting) {
            console.warn("Player tried to join a lobby that already started !");
            joiningWebsocket.send(JSON.stringify({ action: "error", message: "Lobby has already started" }));
            return false;
        }

        if (this.GetPlayerAmount() >= Constants.MAX_PLAYERS_PER_LOBBY) {
            console.warn("Player tried to join a full lobby !");
            joiningWebsocket.send(JSON.stringify({ action: "error", message: "Lobby is full" }));
            return false;
        }

        if (this.players.has(playerId)) {
            console.warn("Player has already joined !");
            joiningWebsocket.send(JSON.stringify({ action: "error", message: "Player has already joined" }));
            return false;
        }

        this.players.forEach((player) => {
            player.websocket.send(JSON.stringify({ action: "player-joined", player_id: playerId }));
        });

        var currentLobbyPlayers : any = Array.from(this.players.values()).map((p) => ({ player_id: p.id, score: p.score }));

        this.players.set(playerId, new LobbyPlayer(playerId, joiningWebsocket));
        joiningWebsocket.send(JSON.stringify({ 
                action: "lobby-joined", 
                lobby_id: this.id, 
                current_lobby_players: currentLobbyPlayers, 
                options: this.options.ToJson() 
            }));
        joiningWebsocket.send(JSON.stringify({ action: "lobby-options-updated", options: this.options.ToJson() }));

        return true;
    }

    public PlayerLeave(playerId: string) : boolean
    {
        if (!this.players.has(playerId)) {
            return false;
        }

        var leavingPlayer = this.players.get(playerId);
        if(leavingPlayer == undefined)
            return false;

        leavingPlayer.websocket.send(JSON.stringify({ action: "lobby-left", lobby_id: this.id }));

        if(this.state == LobbyState.Playing && leavingPlayer.entered_answer != "" && !leavingPlayer.is_spectator && !leavingPlayer.is_spectating)
        {
            leavingPlayer.is_ready_for_next_question = true;
            //ReceiveAnswer();
        }

        if (playerId == this.owner_id) 
        {
            this.TransferOwnership(this.players.keys().next().value!);
        }

        this.players.delete(playerId);
        this.players.forEach((player) => player.websocket.send(JSON.stringify({ action: "player-left", player_id: playerId })));

        return true;
    }

    public TransferOwnership(new_owner_id: string) : void
    {
        if (this.players.size == 0 || new_owner_id == undefined || new_owner_id == this.owner_id) 
            return;
        

        if (!this.players.has(new_owner_id)) 
        {
            new_owner_id = this.players.keys().next().value!;
        }

        this.owner_id = new_owner_id;
		this.players.forEach((player) => player.websocket.send(JSON.stringify({ action: "new-owner", player_id: this.owner_id })));
    }

    public async StartLobby()
    {
        if (this.state != LobbyState.Waiting) 
            return;

        let updatedScores : { player_id: string, new_score: number }[] = [];
        
        this.players.forEach((player) => {
            updatedScores.push({
                player_id: player.id,
                new_score: player.score,
            });
        });

        let updateScores = {
            action: "update-scores",
            scores: updatedScores,
        };

        this.players.forEach((player) => player.websocket.send(JSON.stringify(updateScores)));

        let randomizedWords = Utils.shuffle(await DatabaseConnection.GetTable<Word>(Tables.WORDS));
        let randomizedVerbs = Utils.shuffle(await DatabaseConnection.GetTable<Verb>(Tables.VERBS));
        let randomizedCountries = Utils.shuffle(await DatabaseConnection.GetTable<Country>(Tables.COUNTRY));
        let randomizedGrammar = Utils.shuffle(await DatabaseConnection.GetTable<Word>(Tables.GRAMMAR));

        let questionCategoryAmounts : { [key: number]: number } = {};
        let questionCategoryMaxAmounts : { [key: number]: number } = {};

        let questionCategories = [];
        //console.log("Lobby categories" + lobby.options.categories);

        if(this.options.categories == 0)
        {
            //console.log("No category selected, adding all categories to the lobby questions pool");
            this.options.categories = Constants.DEFAULT_CATEGORIES;
        }

        let availableQuestions = 0;

        var categories : number = this.options.categories;

        if ((categories & Constants.WORD_CATEGORY) != 0) {
            //console.log("Adding words to the lobby questions pool");
            questionCategories.push(Constants.WORD_CATEGORY);
            questionCategoryAmounts[Constants.WORD_CATEGORY] = 0;
            questionCategoryMaxAmounts[Constants.WORD_CATEGORY] = randomizedWords.length;
            availableQuestions += randomizedWords.length;
        }
        if ((categories & Constants.VERB_CATEGORY) != 0) {
            //console.log("Adding verbs to the lobby questions pool");
            questionCategories.push(Constants.VERB_CATEGORY);
            questionCategoryAmounts[Constants.VERB_CATEGORY] = 0;
            questionCategoryMaxAmounts[Constants.VERB_CATEGORY] = randomizedVerbs.length;
            availableQuestions += randomizedVerbs.length;
        }
        if ((categories & Constants.COUNTRY_CATEGORY) != 0) {
            //console.log("Adding countries to the lobby questions pool");
            questionCategories.push(Constants.COUNTRY_CATEGORY);
            questionCategoryAmounts[Constants.COUNTRY_CATEGORY] = 0;
            questionCategoryMaxAmounts[Constants.COUNTRY_CATEGORY] = randomizedCountries.length;
            availableQuestions += randomizedCountries.length;
        }
        if ((categories & Constants.GRAMMAR_CATEGORY) != 0) {
            //console.log("Adding grammar to the lobby questions pool");
            questionCategories.push(Constants.GRAMMAR_CATEGORY);
            questionCategoryAmounts[Constants.GRAMMAR_CATEGORY] = 0;
            questionCategoryMaxAmounts[Constants.GRAMMAR_CATEGORY] = randomizedGrammar.length;
            availableQuestions += randomizedGrammar.length;
        }

        let maxQuestionAmount = Math.min(this.options.max_words, availableQuestions);
        this.options.max_words = maxQuestionAmount;

        this.questions = [];

        for (let i = 0; i < maxQuestionAmount; i++) {
            let question = null;
            let randomCategory : any = -1;
            while (question == null) {
                randomCategory = questionCategories[Math.floor(Math.random() * questionCategories.length)];
                //console.log("Trying to add a question of category " + randomCategory);
                switch (randomCategory) {
                    case Constants.WORD_CATEGORY:
                        if ((questionCategoryAmounts as any)[Constants.WORD_CATEGORY] >= (questionCategoryMaxAmounts as any)[Constants.WORD_CATEGORY]) continue;
                        question = randomizedWords[(questionCategoryAmounts as any)[Constants.WORD_CATEGORY]];
                        (questionCategoryAmounts as any)[Constants.WORD_CATEGORY]++;
                        break;
                    case Constants.VERB_CATEGORY:
                        if ((questionCategoryAmounts as any)[Constants.VERB_CATEGORY] >= (questionCategoryMaxAmounts as any)[Constants.VERB_CATEGORY]) continue;
                        question = randomizedVerbs[(questionCategoryAmounts as any)[Constants.VERB_CATEGORY]];
                        (questionCategoryAmounts as any)[Constants.VERB_CATEGORY]++;
                        break;
                    case Constants.COUNTRY_CATEGORY:
                        if ((questionCategoryAmounts as any)[Constants.COUNTRY_CATEGORY] >= (questionCategoryMaxAmounts as any)[Constants.COUNTRY_CATEGORY]) continue;
                        question = randomizedCountries[(questionCategoryAmounts as any)[Constants.COUNTRY_CATEGORY]];
                        (questionCategoryAmounts as any)[Constants.COUNTRY_CATEGORY]++;
                        break;
                    case Constants.GRAMMAR_CATEGORY:
                        if ((questionCategoryAmounts as any)[Constants.GRAMMAR_CATEGORY] >= (questionCategoryMaxAmounts as any)[Constants.GRAMMAR_CATEGORY]) continue;
                        question = randomizedGrammar[(questionCategoryAmounts as any)[Constants.GRAMMAR_CATEGORY]];
                        (questionCategoryAmounts as any)[Constants.GRAMMAR_CATEGORY]++;
                        break;
                }
            }
            //console.log("Added question " + question);
            this.questions.push({
                category: randomCategory,
                question: question
            });
        }

        this.state = LobbyState.Playing;
        let response = { action: "lobby-started", lobby_id: this.id };
        this.players.forEach((player) => player.websocket.send(JSON.stringify(response)));

        this.current_question_index = 0;
        this.current_round_timer = 0;
        let current_question = this.questions[this.current_question_index];
        this.SendQuestion(current_question);

        MapUtils.filter(this.players, (id, p) => p.is_spectator).forEach((player) =>
        {
            player.is_spectating = true
            player.websocket.send(JSON.stringify({ action: "spectate" }));
            let playerEliminated = { action: "player-eliminated", player_id: player.id };
            MapUtils.filter(this.players, (id, p) => id != player.id).forEach((p) => p.websocket.send(JSON.stringify(playerEliminated)));
        });
    }

    public ContinueLobby() : void
    {
        this.current_question_index = -1;
        this.state = LobbyState.Waiting;
    
        this.players.forEach((player) => {
            //player.score = 0;
            player.entered_answer = "";
            player.is_ready_for_next_question = false;
            player.is_spectating = false;
        });
    }

    public TickLobby() : void
    {
        if (this.state == LobbyState.Playing && this.options.round_timer != -1)
        {
			this.current_round_timer++;
			let timerUpdate = { action: "timer-update", current_round_timer: this.current_round_timer };
			this.players.forEach((player) => player.websocket.send(JSON.stringify(timerUpdate)));
			if (this.current_round_timer >= this.options.round_timer) 
            {
				this.players.forEach((player) => 
                {
					if (player.entered_answer == "" || player.entered_answer == undefined)
						this.ReceiveAnswer(player.id, "", (this.questions[this.current_question_index] as any).category);
				});
			}
		}
    }

    public SendQuestion(question : any) : void
    {
		this.players.forEach((player) => player.websocket.send(JSON.stringify({ action: "new-question", question: question })));
    }

    public NextQuestion() : void
    {
        if(this.state != LobbyState.WaitingForNextQuestion) return;
        this.state = LobbyState.Playing;

        this.players.forEach((player) => (player.is_ready_for_next_question = false));
        this.current_question_index += 1;
        if (this.current_question_index >= this.questions.length) {
            let winnerId = Array.from(this.players.values()).reduce((maxPlayer, player) => player.score > maxPlayer.score ? player : maxPlayer).id;
            this.state = LobbyState.EndScreen;
            let endGame = { action: "end-game", winner_id: winnerId };
            this.players.forEach((player) => player.websocket.send(JSON.stringify(endGame)));
            return;
        }

        if (this.options.round_timer != -1) {
            this.current_round_timer = 0;
            this.players.forEach((player) => player.websocket.send(JSON.stringify({ action: "timer-update", current_round_timer: this.current_round_timer })));
        }

        let current_question = this.questions[this.current_question_index];
        this.SendQuestion(current_question);
    }

    public ReceiveAnswer(playerId: string, answer: string, answerType: number) : void
    {
        if (this.state != LobbyState.Playing) return;

        let player = this.players.get(playerId);
        if (player == undefined ||  player.is_spectating) return;

        var current_question = this.questions[this.current_question_index];
        if (current_question == undefined || current_question.category != answerType) return;

        player.entered_answer = answer;
        player.websocket.send(JSON.stringify({ action: "answer-received", answer: answer }));
        this.players_submitted_answer++;

        Array.from(this.players.values()).filter((p) => !p.is_spectator && !p.is_spectating)
            .forEach((p) => p.websocket.send(JSON.stringify({ action: "player-answered", player_id: playerId })));

        var player_amount = Array.from(this.players.values()).filter((p) => !p.is_spectator && !p.is_spectating).length;

        if (this.players_submitted_answer >= player_amount) {
            this.players_submitted_answer = 0;
            this.UpdateScores();
            this.state = LobbyState.WaitingForNextQuestion;
        }
    }

    public UpdateScores() : void
    {
        let current_question = this.questions[this.current_question_index];
        if (current_question == undefined) return;

        var updatedScores : { player_id: string, new_score: number }[] = [];

        this.players.forEach((player) => {
            if (player.is_spectator || player.is_spectating) return;
            
            let wordSimilarity = this.CheckAnswer(player.entered_answer, current_question.question, current_question.category);
            player.entered_answer = "";
            player.score += wordSimilarity;

            updatedScores.push({
                player_id: player.id,
                new_score: player.score,
            });

            let showResults = { 
                action: "show-results", 
                word_similarity: wordSimilarity, 
                similarity_threshold: this.options.similarity_threshold 
            };

            player.websocket.send(JSON.stringify(showResults));

            this.DoBattleRoyaleElimination(player.id, wordSimilarity);
        });
        
        this.players_submitted_answer = 0;
        let updateScores = {
            action: "update-scores",
            scores: updatedScores,
        };
        this.players.forEach((player) => player.websocket.send(JSON.stringify(updateScores)));
    }
    
    public DoBattleRoyaleElimination(playerId: string, wordSimilarity: number) : void
    {
        if(this.options.lobby_mode != LobbyMode.BattleRoyale) return;

        let player = this.players.get(playerId);
        if (player == undefined) return;

        player.websocket.send(JSON.stringify({ action: "spectate" }));
        player.is_spectating = true;

        let playerEliminated = { action: "player-eliminated", player_id: player.id };
        Array.from(this.players.values()).filter((p) => p.id != player.id).forEach((p) => p.websocket.send(JSON.stringify(playerEliminated)));

        let remainingPlayers : any = Array.from(this.players.values()).filter((p) => p.is_spectating == false);

        if(remainingPlayers.length <= 1)
        {
            this.state = LobbyState.EndScreen;
            let winner = { action: "end-game", winner_id: remainingPlayers.length == 1 ? remainingPlayers[0].id : null};
            Array.from(this.players.values()).forEach((p) => p.websocket.send(JSON.stringify(winner)));
        }
    }

    public PlayerReadyForNextQuestion(playerId: string) : void
    {
        if (this.state != LobbyState.WaitingForNextQuestion) return;
        
        let player = this.players.get(playerId);
        if (player == undefined) return;
    
        player.is_ready_for_next_question = true;
    
        let allReady = true;
        Array.from(this.players.values()).filter((p) => !p.is_spectating).forEach((player) => {
            if (!player.is_ready_for_next_question) allReady = false;
        });
    
        if (allReady) {
            if (this.current_question_index >= this.options.max_words - 1) {
                var playersArray : any = Array.from(this.players.values()).filter((p) => !p.is_spectator && !p.is_spectating);
                var winnerId : string | undefined = playersArray.reduce((maxPlayer : any, player : any) => player.score > maxPlayer.score ? player : maxPlayer, playersArray[0]).id;
                this.state = LobbyState.EndScreen;
                let endGame = { action: "end-game", winner_id: winnerId };
                Array.from(this.players.values()).forEach((player) => player.websocket.send(JSON.stringify(endGame)));
                return;
            }
            this.NextQuestion();
        };
    }

    public CheckAnswer(playerAnswer: any, correctAnswer: any, answerType: number) : number
    {
        switch (answerType) {
            case Constants.WORD_CATEGORY:
            case Constants.COUNTRY_CATEGORY:
            case Constants.GRAMMAR_CATEGORY:
                return this.CheckWord(playerAnswer, correctAnswer.english, this.options.similarity_threshold);
            case Constants.VERB_CATEGORY:
                return this.CheckVerb(playerAnswer, correctAnswer, this.options.similarity_threshold);
            default:
                return 0;
        }
    }

    public CheckWord(playerWord: string, correctWordList: string, lobbyThreshold: number = 0.80) : number {
        let englishWords = correctWordList.split("/");
        let valid = false;
        let minDistance = 1;
        englishWords.forEach((correctWord) => {
            minDistance = Math.min(this.levenshteinDistance(playerWord, correctWord), minDistance);
        });
    
        return (1 - minDistance) >= lobbyThreshold ? 1 - minDistance : 0; 
    }
    
    public CheckVerb(playerVerb: string[], correctVerb: {infinitive : string, preterit : string, past_participle : string}, lobbyThreshold: number = 0.80) : number {
        let infDistance = 1;
        let preDistance = 1;
        let ppDistance = 1;
        
        for(let inf of correctVerb.infinitive.split("/"))
            infDistance = Math.min(this.levenshteinDistance(playerVerb[0], inf), infDistance);
        
        for(let pre of correctVerb.preterit.split("/"))
            preDistance = Math.min(this.levenshteinDistance(playerVerb[1], pre), preDistance);
        
        for(let pp of correctVerb.past_participle.split("/"))
            ppDistance = Math.min(this.levenshteinDistance(playerVerb[2], pp), ppDistance);
        
        return (1 - (infDistance + preDistance + ppDistance) / 3) >= lobbyThreshold ? 1 - (infDistance + preDistance + ppDistance) / 3 : 0;
    }

    public levenshteinDistance(a : string | undefined, b : string | undefined) : number {
        if(a == undefined) a = "";
        if(b == undefined) b = "";

        if (a.length == 0) return b.length;
        if (b.length == 0) return a.length;

        let maxLength = Math.max(a.length, b.length);

        a = a.toLowerCase();
        b = b.toLowerCase();

        const arr : any = [];
        for (let i = 0; i <= a.length; i++) {
            arr[i] = [i];
            for (let j = 1; j <= b.length; j++) {
                arr[i][j] =
                    i === 0
                        ? j
                        : Math.min(
                            arr[i - 1][j] + 1,
                            arr[i][j - 1] + 1,
                            arr[i - 1][j - 1] + (b[j - 1] === a[i - 1] ? 0 : 1)
                        );
            }
        }
        return arr[a.length][b.length] / maxLength;
    }
}