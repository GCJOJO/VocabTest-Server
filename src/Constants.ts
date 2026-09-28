class Constants
{
    static readonly PORT : number = 5762;
    static readonly GAME_VERSION : string = "0.0.12";

    static readonly MAX_PLAYERS_PER_LOBBY : number = 32;

    static readonly WORD_CATEGORY : number 	    = 1 << 0;
    static readonly VERB_CATEGORY : number 	    = 1 << 1;
    static readonly COUNTRY_CATEGORY : number 	= 1 << 2;
    static readonly GRAMMAR_CATEGORY : number 	= 1 << 3;
    static readonly GAMING_CATEGORY : number   = 1 << 4;
    
    static readonly DEFAULT_CATEGORIES : number = Constants.WORD_CATEGORY | Constants.VERB_CATEGORY | Constants.COUNTRY_CATEGORY | Constants.GRAMMAR_CATEGORY;
}

export { Constants }