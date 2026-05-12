export class Constants
{
    static readonly SERVER_PORT : number = 5762;
    static readonly SOCKET_PORT : number = 5763;

    static readonly MAX_PLAYERS_PER_LOBBY : number = 32;
    
    static readonly WORD_CATEGORY : number 	= 1 << 0;
    static readonly VERB_CATEGORY : number 	= 1 << 1;
    static readonly COUNTRY_CATEGORY : number 	= 1 << 2;
    static readonly GRAMMAR_CATEGORY : number 	= 1 << 3;
    
    static readonly DEFAULT_CATEGORIES : number = Constants.WORD_CATEGORY | Constants.VERB_CATEGORY | Constants.COUNTRY_CATEGORY | Constants.GRAMMAR_CATEGORY;
}
