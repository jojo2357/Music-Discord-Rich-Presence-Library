const {spawn} = require('child_process');
const readline = require('readline').createInterface({
    input: process.stdin,
    output: process.stdout
});
const fs = require("fs");
const jsmediatags = require("jsmediatags");
const path = require("path");

let guysdone = 0;
let guysFailed = 0;
let completed = [];
let user = "";

Main();

function findCoverFromApple(albumName = "Origins", artistName = "") {
    return new Promise((resolve, reject) => {
        let out = '';
        let http = `https://itunes.apple.com/search?term=${encodeURI(albumName)}&media=music&country=us&entity=album`;
        console.log("Querying " + http);
        let req = spawn("curl", [http]);

        req.stdout.on('data', (data) => {
            out += data.toString();
        });

        req.on('exit', () => {
            console.log("query finnished");
            let json;
            try {
                json = JSON.parse(out);
            } catch (e) {
            }
            let album = json.results.filter((listing) => (listing.artistName + "").toLowerCase().includes(artistName.toLowerCase()));
            if (album.length === 0)
                reject("Nope");
            else
                resolve(album[0].artworkUrl100.replace("100x100", "512x512"));
        });
    });

}

function Main() {
    if (!fs.existsSync(path.join(process.cwd(), "images")))
        fs.mkdirSync(path.join(process.cwd(), "images"));
    fs.writeFileSync(path.join(process.cwd(), "all.dat"), "");
    readline.question("Who is this (github username is good, just for naming your files for the library)\n", (nameIn) => {
        name = nameIn;
        readline.question("MP3 or DAT: ", (choice) => {
            if (choice.toLowerCase() === "dat") {
                fs.readdirSync(process.cwd()).forEach(filder => {
                    if (filder.includes('.dat') && !filder.includes("all.dat")) {
                        downloadAlbumsFromFile(filder).then(() => {
                            console.log("\nFinished downloading.");
                            setupExport();
                            process.exit(0);
                        }).catch((e) => {
                            console.log(e);
                            setupExport();
                            process.exit(1);
                        });
                    }
                });
            } else if (choice.toLowerCase() === "mp3") {
                readline.question('Where are your pictures? (fully qualified dir pls)\n', loc => {
                    if (fs.lstatSync(loc).isDirectory())
                        locateMP3FromFolder(loc).then((resolver) => {
                            console.log(`All done from ${resolver} ${guysdone} (${guysFailed})`);
                            setupExport();
                            process.exit(0);
                        }).catch(console.error);
                    else
                        console.log("I can't find this.");
                });
            } else {
                console.log("Can you choose, like, a real option? Thanks.");
                Main();
            }
        });
    });
}

function downloadAlbumsFromFile(file) {
    return new Promise((resolve, reject) => {
        let resolves = 0;
        let data = fs.readFileSync(file).toString().split("\n");
        data.forEach((line) => {
            var album = line.split('==')[0];
            var link = line.split('==')[1].replace('\r', '');
            downloadImageFromWeb(cleanUp(album), link).then((res) => {
                writeOverwritable(`Downloaded album cover (${resolves}) : ` + album);
                fs.appendFileSync(path.join(process.cwd(), "all.dat"), album + "\r\n");
                if (++resolves === data.length)
                    resolve();
            }).catch((thing) => {
                if (++resolves === data.length)
                    resolve();
            });
        });
    });
}

function downloadImageFromWeb(albumName, url) {
    return new Promise((resolve, reject) => {
        writeOverwritable(`I'm downloading ` + url);
        let p = spawn("curl", [url]);
        let out = fs.createWriteStream(path.join(process.cwd(), "images/" + cleanUp(albumName) + ".jpg"));
        p.stdout.pipe(out);
        p.on("exit", (code) => {
            if (code === 0)
                resolve();
            else
                reject(code);
        });
    });
}

function locateMP3FromFolder(folder) {
    return new Promise(async (resolve, reject) => {
        for (const file of fs.readdirSync(folder)) {
            if (fs.lstatSync(folder + '\\' + file).isDirectory())
                locateMP3FromFolder(folder + '\\' + file).then().catch();
            else if ((folder + '\\' + file).includes(".mp3")) {
                try {
                    let thing = (await fetchAlbumsFromMP3(folder, file));
                    if (completed.includes(thing.tags.album))
                        continue;
                    guysdone++;
                    if (!thing.tags.picture) {
                        if (thing.tags.album.length > 0 && thing.tags.album.trim() !== "Unknown Album") {
                            try {
                                await (new Promise((resolve1, reject1) => {
                                    findCoverFromApple(thing.tags.album, thing.tags.artist.substring(0, 8)).then((url = "") => {
                                        downloadImageFromWeb(thing.tags.album, url).then((res) => {
                                            completed.push(thing.tags.album);
                                            fs.appendFileSync(path.join(process.cwd(), "all.dat"), thing.tags.album + "\r\n");
                                            resolve1(res);
                                        }).catch(reject1);
                                    }).catch((reason) => reject1("Could not download art for " + thing.tags.album, reason));
                                }));
                            } catch (a) {
                                console.log(a);
                            }
                        }
                        continue;
                    }
                    const {data, format} = thing.tags.picture;
                    fs.writeFileSync(path.join(process.cwd(), "images/" + cleanUp(thing.tags.album) + ".jpg"), Buffer.from(data));
                    completed.push(thing.tags.album);
                    fs.appendFileSync(path.join(process.cwd(), "all.dat"), thing.tags.album + "\r\n");
                } catch (e) {
                    console.error(`Something went wrong reading art from ${file} ${e}`);
                }
            }
        }
        resolve(folder);
    });
}

function fetchAlbumsFromMP3(folder, file) {
    return new Promise((resolve, reject) => {
        new jsmediatags.Reader(folder + '\\' + file)
            .setTagsToRead(["artist", "album", "picture"])
            .read({
                onSuccess: function (tag) {
                    resolve(tag);
                },
                onError: function (error) {
                    guysFailed++;
                    reject(error);
                }
            });
    });
}

function setupExport() {
    if (fs.existsSync("archive")) {
        var dater = fs.readFileSync(path.join(process.cwd(), 'all.dat')).toString().split('\r\n');
        fs.readdirSync(path.join(process.cwd(), "archive")).forEach((file) => {
            fs.readFileSync(path.join(process.cwd(), "archive/" + file)).toString().split(/(\r\n|\r|\n)+/).forEach(line => {
                if (line.includes('==') && dater.includes(line.split('==')[0]))
                    dater.splice(dater.indexOf(line.split('==')[0]), 1);
            });
        });
        fs.writeFileSync(path.join(process.cwd(), 'all.dat'), dater.join('\r\n'));
    }
    beginToExport(0);
}

function beginToExport(version) {
    if (version === undefined) {
        version = 1;
    }
    createExportFolder("spotify", version);
    createExportFolder("groove", version);
    createExportFolder("musicbee", version);

    const startTime = (new Date().getTime());
    fs.writeFileSync(path.join(process.cwd(), "spotify" + version + "/" + name + "spotify" + startTime + version + ".dat"), "spotify=spotify\nid=\n");
    fs.writeFileSync(path.join(process.cwd(), "groove" + version + "/" + name + "groove" + startTime + version + ".dat"), "music.ui=groove\nid=\n");
    fs.writeFileSync(path.join(process.cwd(), "musicbee" + version + "/" + name + "musicbee" + startTime + version + ".dat"), "musicbee=musicbee\nid=\n");
    fs.readFileSync(path.join(process.cwd(), 'all.dat')).toString().split('\r\n').forEach((image, windex) => {
        if (windex > 146 || image === '') {
            return;
        }
        writeOverwritable(`Copying image (${windex}) images/` + cleanUp(image) + ".jpg");// + " to " + path.join(process.cwd(), name + version + "/" + windex + ".jpg") + '\r'); //debug ig
        addImageKey("groove", version, startTime, image, windex);
        addImageKey("spotify", version, startTime, image, windex);
        addImageKey("musicbee", version, startTime, image, windex);
    });
    var dater = fs.readFileSync(path.join(process.cwd(), 'all.dat')).toString().split('\r\n');
    dater.splice(0, 147);
    if (dater.length > 0) {
        fs.writeFileSync(path.join(process.cwd(), 'all.dat'), dater.join('\r\n'));
        beginToExport(version + 1);
    } else {
        killDirectory(path.join(process.cwd(), 'images'));
        while (fs.existsSync(path.join(process.cwd(), "groove" + ++version))) {
            killDirectory(path.join(process.cwd(), 'groove' + version));
            killDirectory(path.join(process.cwd(), 'musicbee' + version));
            killDirectory(path.join(process.cwd(), 'spotify' + version));
        }
        fs.unlinkSync(path.join(process.cwd(), "all.dat"));
    }
}

function cleanUp(instring) {
    return instring.replace(/[\\/?:<>|"*]/g, '');
}

function createExportFolder(playerName, version = 1) {
    killDirectory(path.join(process.cwd(), playerName + version));
    fs.mkdirSync(path.join(process.cwd(), playerName + version));
    fs.copyFileSync(path.join(process.cwd(), "assets/paused.jpg"), path.join(process.cwd(), playerName + version + "/paused.png"));
    fs.copyFileSync(path.join(process.cwd(), "assets/" + playerName + "_small.png"), path.join(process.cwd(), playerName + version + "/" + playerName + "_small.png"));
    fs.copyFileSync(path.join(process.cwd(), "assets/" + playerName + ".png"), path.join(process.cwd(), playerName + version + "/" + playerName + ".png"));
}

function addImageKey(playerName, version, startTime, image, windex) {
    fs.appendFileSync(path.join(process.cwd(), playerName + version + "/" + name + playerName + startTime + version + ".dat"), image + '==' + windex + '\n');
    fs.copyFileSync(path.join(process.cwd(), "images/" + cleanUp(image) + ".jpg"), path.join(process.cwd(), playerName + version + "/" + windex + ".jpg"));
}

function killDirectory(location) {
    if (fs.existsSync(location)) {
        //fs.readdirSync(location).forEach(file => fs.unlinkSync(location + '/' + file));
        fs.rmdirSync(location, {
            recursive: true,
            maxRetries: 1,
            retryDelay: 100
        });
    }
}

function writeOverwritable(message = "") {
    try {
        if (message.length >= process.stdout.columns)
            message = message.substring(0, process.stdout.columns - 2);
        process.stdout.write(message + ' '.repeat(process.stdout.columns - 3 - message.length) + '\r');
    } catch (e) {
    }
}

process.on('unhandledRejection', (reason, p) => {
    console.trace('Unhandled Rejection at: Promise', p, 'reason:', reason);
});