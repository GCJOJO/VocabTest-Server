import cron from "node-cron";
import * as DatabaseConnection from "./DatabaseConnection.js";
import * as Utils from "./Utils.js";

var lobbies = [];

const MAX_PLAYERS_PER_LOBBY = 10;

const WORD_CATEGORY 	= 1 << 0;
const VERB_CATEGORY 	= 1 << 1;
const COUNTRY_CATEGORY 	= 1 << 2;
const GRAMMAR_CATEGORY 	= 1 << 3;

const DEFAULT_CATEGORIES = WORD_CATEGORY | VERB_CATEGORY | COUNTRY_CATEGORY | GRAMMAR_CATEGORY;

const LobbyMode = {
	CLASSIC: 0,
	BATTLE_ROYALE: 1
};

export function createLobby(playerId, ownerWebsocket) {
	let lobbyId = Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15);

	lobbies[lobbyId] = {
		owner: playerId,
		players: [],
		questions: [],
		current_question_index: 0,
		players_submitted_answers: 0,
		current_round_timer: -1,
		status: "waiting",
		options:
		{
			"max_words": 10, 						// -1 means ALL OF THEM
			"categories": DEFAULT_CATEGORIES,		//  1000 : country, 0100 : grammar, 0010 : verbs, 0001 : vocabulary
			"round_timer": 30, 						// timer in seconds, -1 : no timer
			"similarity_threshold": 0.8,			// 0 to 1, how similar the words must be to be considered correct,
			"lobby_mode" : LobbyMode.CLASSIC,					
		},
	};

	return lobbyId;
}

export function joinLobby(lobbyId, playerId, playerWebsocket) {
	let lobby = lobbies[lobbyId];
	if (lobby != undefined) {
		if (lobby.status != "waiting") {
			console.warn("Player tried to join a lobby that already started !");
			playerWebsocket.send(JSON.stringify({ action: "error", message: "Lobby has already started" }));
			return false;
		}

		if (lobby.players.length >= MAX_PLAYERS_PER_LOBBY) {
			console.warn("Player tried to join a full lobby !");
			playerWebsocket.send(JSON.stringify({ action: "error", message: "Lobby is full" }));
			return false;
		}

		if (lobby.players.filter((player) => player.id == playerId).length != 0) {
			console.warn("Player has already joined !");
			playerWebsocket.send(JSON.stringify({ action: "error", message: "Player has already joined" }));
			return false;
		}

		let currentLobbyPlayers = lobbies[lobbyId].players.map((player) => {
			return { player_id: player.id, score: player.score };
		});

		let response = { action: "lobby-joined", lobby_id: lobbyId, current_lobby_players: currentLobbyPlayers };
		playerWebsocket.send(JSON.stringify(response));

		let lobbyOptions = { action: "lobby-options-updated", options: lobby.options };
		playerWebsocket.send(JSON.stringify(lobbyOptions));

		let playerJoined = { action: "player-joined", player_id: playerId };
		lobby.players.forEach((player) => player.websocket.send(JSON.stringify(playerJoined)));

		lobby.players.push({
			id: playerId,
			entered_word: "",
			ready_for_next_word: false,
			is_spectator: false,    		// For players who chose to spectate the game from the beginning
			is_spectating: false, 			// For players who were eliminated and are now spectating the game
			score: 0,
			websocket: playerWebsocket,
		});
		return true;
	}

	return false;
}

export function leaveLobby(lobbyId, playerId) {
	let lobby = lobbies[lobbyId];
	if (lobby != undefined) {
		let leavingPlayer = lobby.players.find((player) => player.id == playerId);
		let response = { action: "lobby-left", lobby_id: lobbyId };
		leavingPlayer.websocket.send(JSON.stringify(response));

		if (lobby.status == "started" && leavingPlayer.entered_word == "")
			receiveAnswer(lobbyId, playerId, "", lobby.questions[lobby.current_question_index].category);

		lobby.players = lobby.players.filter((player) => player.id != playerId);

		lobby.players.forEach((player) => {
			let playerLeft = { action: "player-left", player_id: playerId };
			player.websocket.send(JSON.stringify(playerLeft));
		});


		if (lobbies[lobbyId].players.length == 0) disbandLobby(lobbyId);
		else if (lobby.owner == playerId) {
			lobby.owner = lobby.players[0].id;
			let newOwner = { action: "new-owner", player_id: lobby.owner };
			lobby.players.forEach((player) => player.websocket.send(JSON.stringify(newOwner)));
		}

		return true;
	}
	return false;
}

export function updateLobbyOptions(lobbyId, playerId, options) {
	let lobby = lobbies[lobbyId];
	if (lobby != undefined && lobby.owner == playerId) {
		lobby.options = options;
		//console.log("Lobby " + lobbyId + " options updated : " + JSON.stringify(options));
		lobby.players.forEach((player) => player.websocket.send(JSON.stringify({ action: "lobby-options-updated", options: options })));
	}
}

export function getLobbyOptions(lobbyId) {
	let lobby = lobbies[lobbyId];
	if (lobby != undefined) {
		return lobby.options;
	}
	return null;
}

export function disbandLobby(lobbyId) {
	let lobby = lobbies[lobbyId];
	if (lobby != undefined) {
		let response = { action: "lobby-disbanded", lobby_id: lobbyId };
		lobby.players.forEach((player) => player.websocket.send(JSON.stringify(response)));

		delete lobbies[lobbyId];
	}
}

export function startLobby(lobbyId, playerId) {
	let lobby = lobbies[lobbyId];
	if (lobby != undefined && lobby.owner == playerId) {
		let updatedScores = [];

		lobby.players.forEach((player) => {
			updatedScores.push({
				player_id: player.id,
				new_score: player.score,
			});
		});

		let updateScores = {
			action: "update-scores",
			scores: updatedScores,
		};

		lobby.players.forEach((player) => player.websocket.send(JSON.stringify(updateScores)));

		let randomizedWords = Utils.shuffle(DatabaseConnection.getWords());
		let randomizedVerbs = Utils.shuffle(DatabaseConnection.getVerbs());
		let randomizedCountries = Utils.shuffle(DatabaseConnection.getCountries());
		let randomizedGrammar = Utils.shuffle(DatabaseConnection.getGrammar());

		let questionCategoryAmounts = {};
		let questionCategoryMaxAmounts = {};

		let questionCategories = [];
		//console.log("Lobby categories" + lobby.options.categories);

		if(lobby.options.categories == 0)
		{
			//console.log("No category selected, adding all categories to the lobby questions pool");
			lobby.options.categories = DEFAULT_CATEGORIES;
		}

		let availableQuestions = 0;
		if ((lobby.options.categories & WORD_CATEGORY) != 0) {
			//console.log("Adding words to the lobby questions pool");
			questionCategories.push(WORD_CATEGORY);
			questionCategoryAmounts[WORD_CATEGORY] = 0;
			questionCategoryMaxAmounts[WORD_CATEGORY] = randomizedWords.length;
			availableQuestions += randomizedWords.length;
		}
		if ((lobby.options.categories & VERB_CATEGORY) != 0) {
			//console.log("Adding verbs to the lobby questions pool");
			questionCategories.push(VERB_CATEGORY);
			questionCategoryAmounts[VERB_CATEGORY] = 0;
			questionCategoryMaxAmounts[VERB_CATEGORY] = randomizedVerbs.length;
			availableQuestions += randomizedVerbs.length;
		}
		if ((lobby.options.categories & COUNTRY_CATEGORY) != 0) {
			//console.log("Adding countries to the lobby questions pool");
			questionCategories.push(COUNTRY_CATEGORY);
			questionCategoryAmounts[COUNTRY_CATEGORY] = 0;
			questionCategoryMaxAmounts[COUNTRY_CATEGORY] = randomizedCountries.length;
			availableQuestions += randomizedCountries.length;
		}
		if ((lobby.options.categories & GRAMMAR_CATEGORY) != 0) {
			//console.log("Adding grammar to the lobby questions pool");
			questionCategories.push(GRAMMAR_CATEGORY);
			questionCategoryAmounts[GRAMMAR_CATEGORY] = 0;
			questionCategoryMaxAmounts[GRAMMAR_CATEGORY] = randomizedGrammar.length;
			availableQuestions += randomizedGrammar.length;
		}

		let maxQuestionAmount = Math.min(lobby.options.max_words, availableQuestions);
		lobby.options.max_words = maxQuestionAmount;

		lobby.questions = [];

		for (let i = 0; i < maxQuestionAmount; i++) {
			let question = null;
			let randomCategory = -1;
			while (question == null) {
				randomCategory = questionCategories[Math.floor(Math.random() * questionCategories.length)];
				//console.log("Trying to add a question of category " + randomCategory);
				switch (randomCategory) {
					case WORD_CATEGORY:
						if (questionCategoryAmounts[WORD_CATEGORY] >= questionCategoryMaxAmounts[WORD_CATEGORY]) continue;
						question = randomizedWords[questionCategoryAmounts[WORD_CATEGORY]];
						questionCategoryAmounts[WORD_CATEGORY]++;
						break;
					case VERB_CATEGORY:
						if (questionCategoryAmounts[VERB_CATEGORY] >= questionCategoryMaxAmounts[VERB_CATEGORY]) continue;
						question = randomizedVerbs[questionCategoryAmounts[VERB_CATEGORY]];
						questionCategoryAmounts[VERB_CATEGORY]++;
						break;
					case COUNTRY_CATEGORY:
						if (questionCategoryAmounts[COUNTRY_CATEGORY] >= questionCategoryMaxAmounts[COUNTRY_CATEGORY]) continue;
						question = randomizedCountries[questionCategoryAmounts[COUNTRY_CATEGORY]];
						questionCategoryAmounts[COUNTRY_CATEGORY]++;
						break;
					case GRAMMAR_CATEGORY:
						if (questionCategoryAmounts[GRAMMAR_CATEGORY] >= questionCategoryMaxAmounts[GRAMMAR_CATEGORY]) continue;
						question = randomizedGrammar[questionCategoryAmounts[GRAMMAR_CATEGORY]];
						questionCategoryAmounts[GRAMMAR_CATEGORY]++;
						break;
				}
			}
			//console.log("Added question " + question);
			lobby.questions.push({
				category: randomCategory,
				question: question
			});
		}

		lobby.status = "started";
		let response = { action: "lobby-started", lobby_id: lobbyId };
		lobby.players.forEach((player) => player.websocket.send(JSON.stringify(response)));

		lobby.current_question_index = 0;
		lobby.current_round_timer = 0;
		let current_question = lobby.questions[lobby.current_question_index];
		sendQuestion(lobbyId, current_question);

		lobby.players.filter((p) => p.is_spectator).forEach((player) => 
		{
			player.is_spectating = true
			player.websocket.send(JSON.stringify({ action: "spectate" }));

			let playerEliminated = { action: "player-eliminated", player_id: player.id };
			lobby.players.filter((p) => p.id != player.id).forEach((p) => p.websocket.send(JSON.stringify(playerEliminated)));
		});
	}
}

export function setIsSpectator(lobbyId, playerId, isSpectator) 
{
	let lobby = lobbies[lobbyId];
	if (lobby == undefined) return;

	let player = lobby.players.find(p => p.id === playerId);
	if (player == undefined) return;

	player.is_spectator = isSpectator;
	player.is_spectating = isSpectator;

	let response = { action: "spectator-status-updated", player_id: playerId, is_spectator: isSpectator };
	lobby.players.forEach((p) => p.websocket.send(JSON.stringify(response)));
}

export function sendQuestion(lobbyId, question) {
	let lobby = lobbies[lobbyId];
	if (lobby == undefined) return;

	let newQuestion = { action: "new-question", question: question };
	lobby.players.forEach((player) => player.websocket.send(JSON.stringify(newQuestion)));
}

export function nextQuestion(lobbyId) {
	let lobby = lobbies[lobbyId];
	if (lobby == undefined) return;

	if(lobby.status != "waiting-for-next-question") return;
	lobby.status = "started";

	lobby.players.forEach((player) => (player.ready_for_next_answer = false));
	lobby.current_question_index += 1;
	if (lobby.current_question_index >= lobby.questions.length) {
		let winnerId = lobby.players.reduce((maxPlayer, player) => player.score > maxPlayer.score ? player : maxPlayer, lobby.players[0]).id;
		lobby.status = "ended";
		let endGame = { action: "end-game", winner_id: winnerId };
		lobby.players.forEach((player) => player.websocket.send(JSON.stringify(endGame)));
		return;
	}

	if (lobby.options.round_timer != -1) {
		lobby.current_round_timer = 0;
		lobby.players.forEach((player) => player.websocket.send(JSON.stringify({ action: "timer-update", current_round_timer: lobby.current_round_timer })));
	}

	let current_question = lobby.questions[lobby.current_question_index];
	sendQuestion(lobbyId, current_question);
}

export function receiveAnswer(lobbyId, playerId, answer, answerType) {
	let lobby = lobbies[lobbyId];
	if (lobby == undefined) return;

	if (lobby.status != "started") return;

	if (answerType != lobby.questions[lobby.current_question_index].category) return;

	let player = lobby.players.find(p => p.id === playerId);
	if (player == undefined) return;

	if(player.is_spectating) return;

	let response = { action: "answer-received", answer: answer };
	player.websocket.send(JSON.stringify(response));

	lobby.players.filter((p) => p.is_spectating == true).forEach((spectator) => 
	{
		let playerAnswered = { action: "player-answered", player_id: playerId };
		spectator.websocket.send(JSON.stringify(playerAnswered));
	});

	player.entered_answer = answer;
	lobby.players_submitted_answers++;
	
	let players_amount = lobby.players.filter((p) => p.is_spectating == false).length;

	if (lobby.players_submitted_answers >= players_amount) {
		updateScores(lobbyId);
		lobby.status = "waiting-for-next-question";
	}
}

export function updateScores(lobbyId) {
	let lobby = lobbies[lobbyId];
	if (lobby == undefined) return;

	let updatedScores = [];
	let currentQuestion = lobby.questions[lobby.current_question_index];
	lobby.players.forEach((player) => {
		if(player.is_spectating) return;

		let wordSimilarity = checkAnswer(player.entered_answer, currentQuestion.question, currentQuestion.category, lobby.options.similarity_threshold);
		player.entered_answer = "";
		player.score += wordSimilarity;

		updatedScores.push({
			player_id: player.id,
			new_score: player.score,
		});
		let showResults = { action: "show-results", word_similarity: wordSimilarity, similarity_threshold: lobby.options.similarity_threshold };
		player.websocket.send(JSON.stringify(showResults));

		if(lobby.options.lobby_mode == LobbyMode.BATTLE_ROYALE)
		{
			console.log("Player" + player.id + " got a score of " + wordSimilarity + " for the question " + JSON.stringify(currentQuestion.question));
			if(wordSimilarity != 1)
			{
				player.websocket.send(JSON.stringify({ action: "spectate" }));
				player.is_spectating = true;

				let playerEliminated = { action: "player-eliminated", player_id: player.id };
				lobby.players.filter((p) => p.id != player.id).forEach((p) => p.websocket.send(JSON.stringify(playerEliminated)));

				let remainingPlayers = lobby.players.filter((p) => p.is_spectating == false);

				if(remainingPlayers.length <= 1)
				{
					lobby.status = "ended";
					let winner = { action: "end-game", winner_id: remainingPlayers.length == 1 ? remainingPlayers[0].id : null};
					lobby.players.forEach((p) => p.websocket.send(JSON.stringify(winner)));
				}
			}
		}
	});

	lobby.players_submitted_answers = 0;

	let updateScores = {
		action: "update-scores",
		scores: updatedScores,
	};
	lobby.players.forEach((player) => player.websocket.send(JSON.stringify(updateScores)));
}

export function playerRequestedNextQuestion(lobbyId, playerId) {
	let lobby = lobbies[lobbyId];
	if (lobby == undefined) return;

	if (lobby.status != "waiting-for-next-question") return;

	let player = lobby.players.find(player => player.id === playerId)
	if (player == undefined) return;

	player.ready_for_next_answer = true;

	let allReady = true;
	lobby.players.filter((p) => !p.is_spectating).forEach((player) => {
		if (!player.ready_for_next_answer) allReady = false;
	});

	if (allReady) {
		if (lobby.current_question_index >= lobby.options.max_words - 1) {
			let winnerId = lobby.players.reduce((maxPlayer, player) => player.score > maxPlayer.score ? player : maxPlayer, lobby.players[0]).id;
			lobby.status = "ended";
			let endGame = { action: "end-game", winner_id: winnerId };
			lobby.players.forEach((player) => player.websocket.send(JSON.stringify(endGame)));
			return;
		}
		nextQuestion(lobbyId);
	};
}

export function continueGame(lobbyId)
{
	let lobby = lobbies[lobbyId];
	if (lobby == undefined) return;
	lobby.current_question_index = -1;
	lobby.status = "waiting";

	lobby.players.forEach((player) => {
		//player.score = 0;
		player.entered_answer = "";
		player.ready_for_next_answer = false;
		player.is_spectating = false;
	});
}

export function checkAnswer(playerAnswer, correctAnswer, answerType, lobbyThreshold = 0.80) {
	switch (answerType) {
		case WORD_CATEGORY:
			return checkWord(playerAnswer, correctAnswer.anglais, lobbyThreshold);
		case COUNTRY_CATEGORY:
		case GRAMMAR_CATEGORY:
			return checkWord(playerAnswer, correctAnswer.english, lobbyThreshold);
		case VERB_CATEGORY:
			return checkVerb(playerAnswer, correctAnswer, lobbyThreshold);
		default:
			return 0;
	}
}

export function checkWord(playerWord, correctWordList, lobbyThreshold = 0.80) {
	let englishWords = correctWordList.split("/");
	let valid = false;
	let minDistance = 1;
	englishWords.forEach((correctWord) => {
		minDistance = Math.min(levenshteinDistance(playerWord, correctWord), minDistance);
	});

	return (1 - minDistance) >= lobbyThreshold ? 1 - minDistance : 0; 
}

export function checkVerb(playerVerb, correctVerb, lobbyThreshold = 0.80) {
	let infDistance = 1;
	let preDistance = 1;
	let ppDistance = 1;

	//console.log("Inf : ", correctVerb.infinitive.split("/"));
	//console.log("Pre : ", correctVerb.preterit.split("/"));
	//console.log("PP : ", correctVerb.past_participle.split("/"));

	for(let inf of correctVerb.infinitive.split("/"))
		infDistance = Math.min(levenshteinDistance(playerVerb[0], inf), infDistance);
	
	for(let pre of correctVerb.preterit.split("/"))
		preDistance = Math.min(levenshteinDistance(playerVerb[1], pre), preDistance);
	
	for(let pp of correctVerb.past_participle.split("/"))
		ppDistance = Math.min(levenshteinDistance(playerVerb[2], pp), ppDistance);
	
	return (1 - (infDistance + preDistance + ppDistance) / 3) >= lobbyThreshold ? 1 - (infDistance + preDistance + ppDistance) / 3 : 0;
}

export function getLobbies() {
	var lobbiesJson = [];
	Object.keys(lobbies).forEach(function (lobbyId) {
		var lobbyJson = {};
		var lobby = lobbies[lobbyId];
		lobbyJson["id"] = lobbyId;
		lobbyJson["owner"] = lobby.owner;
		lobbyJson["player_count"] = lobby.players.length;
		lobbyJson["options"] = lobby.options;
		lobbyJson["questions"] = lobby.questions;
		lobbyJson["current_question_index"] = lobby.current_question_index;
		lobbyJson["players_submitted_answers"] = lobby.players_submitted_answers;
		lobbyJson["status"] = lobby.status;
		lobbyJson["lobby_mode"] = lobby.options.lobby_mode;
		lobbiesJson.push(lobbyJson);
	});

	return lobbiesJson;
}

export function testOwnership(lobbyId, playerId) {
	var lobby = lobbies[lobbyId];
	if (lobby == undefined) {
		return false;
	}
	return lobby.owner == playerId;
}

export function levenshteinDistance(a, b) {
	if(a == undefined) a = "";
	if(b == undefined) b = "";

	if (a.length == 0) return b.length;
	if (b.length == 0) return a.length;

	let maxLength = Math.max(a.length, b.length);

	a = a.toLowerCase();
	b = b.toLowerCase();

	const arr = [];
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

cron.schedule("* * * * * *", () => {
	Object.keys(lobbies).forEach(function (lobbyId) {
		var lobby = lobbies[lobbyId];
		if (lobby.status == "started" && lobby.options.round_timer != -1) {
			lobby.current_round_timer++;
			let timerUpdate = { action: "timer-update", current_round_timer: lobby.current_round_timer };
			lobby.players.forEach((player) => player.websocket.send(JSON.stringify(timerUpdate)));
			if (lobby.current_round_timer >= lobby.options.round_timer) {
				lobby.players.forEach((player) => {
					if (player.entered_answer == "" || player.entered_answer == undefined)
						//receiveAnswer(lobbyId, player.id, "");
						receiveAnswer(lobbyId, player.id, "", lobby.questions[lobby.current_question_index].category);
				});
			}
		}
	});
});

// Cleanup lobbies every 30 seconds
cron.schedule("*/30 * * * * *", () => {
	var lobbiesBeforeCleanup = Object.keys(lobbies).length;
	Object.keys(lobbies).forEach(function (lobbyId) {
		var lobby = lobbies[lobbyId];
		lobby.players.forEach((player) => {
			if (player.websocket.readyState != 1)
				leaveLobby(lobbyId, player.id);
		});
	});
	let lobbiesCleaned = lobbiesBeforeCleanup - Object.keys(lobbies).length;
	if (lobbiesCleaned > 0)
		console.log("Cleaned up " + lobbiesCleaned + " lobbies.");
});