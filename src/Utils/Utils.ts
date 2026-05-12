import crypto from "crypto";

export class Utils
{
    public static shuffle(array : any[]) : any[]
    {
        let arrayCopy = array;
        let currentIndex = arrayCopy.length;

        // While there remain elements to shuffle...
        while (currentIndex != 0) {
            // Pick a remaining element...
            let randomIndex = Math.floor(Math.random() * currentIndex);
            currentIndex--;

            // And swap it with the current element.
            [arrayCopy[currentIndex], arrayCopy[randomIndex]] = [arrayCopy[randomIndex], arrayCopy[currentIndex]];
        }
        return arrayCopy;
    }

    public static uuidv4() 
    {
        if(crypto == undefined || crypto.getRandomValues == undefined)
            return "crypto_not_supported";

        return "10000000-1000-4000-8000-100000000000".replace(/[018]/g, c =>
            (+c ^ (crypto as any).getRandomValues(new Uint8Array(1))[0] & 15 >> +c / 4).toString(16));
    }
}