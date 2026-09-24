const password = process.argv[2];

if (!password) {
    console.error("Usage: bun hash-password.ts <password>");
    process.exit(1);
}

const hash = await Bun.password.hash(password);
console.log(hash);