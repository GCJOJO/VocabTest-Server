import * as DatabaseConnection from "./DatabaseConnection.js";
import * as Utils from "./Utils.js";

export async function createUser(username, first_name, last_name, password_hash) 
{
    let uuid = Utils.uuidv4();
    let result = await DatabaseConnection.createUser(uuid, username, first_name, last_name, password_hash);
    return { success: result, uuid: uuid };
}