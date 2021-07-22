const {spawn} = require('child_process');
const readline = require('readline').createInterface({
    input: process.stdin,
    output: process.stdout
});
const fs = require("fs");
const jsmediatags = require("jsmediatags");
const path = require("path");
const resizer = require("sharp");
const resemble = require("resemblejs/compareImages");

const startTime = new Date().getTime();

let version = -1;
let amountExported = 0;
let totalSavings = 0;
let threshold = 0.00001;

let guysdone = 0;
let guysFailed = 0;
let fetchedAlbums = 0;
let expectedAlbums = 0;
let completed = [];
let albumsAskedFor = [];
let user = "";

Main();

function areTwoPicsTheSame(location1, location2) {
    const options = {
        returnEarlyThreshold: threshold,
        ignore: "antialiasing",
    };

    // The parameters can be Node Buffers
    // data is the same as usual with an additional getBuffer() function
    return new Promise((resolve, reject) => resemble(
        fs.readFileSync(location1),
        fs.readFileSync(location2),
        options
    ).then(data => {
        if (data.rawMisMatchPercentage < threshold)
            console.log("winner: " + data.rawMisMatchPercentage);
        resolve(data.rawMisMatchPercentage < threshold);
    }).catch(reject));
}

function similarityOfTwo(location1, location2) {
    const options = {
        returnEarlyThreshold: 100,
        ignore: "antialiasing",
    };

    // The parameters can be Node Buffers
    // data is the same as usual with an additional getBuffer() function
    return new Promise((resolve, reject) => resemble(
        fs.readFileSync(location1),
        fs.readFileSync(location2),
        options
    ).then(data => {
        resolve(data.rawMisMatchPercentage);
    }).catch(reject));
}

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
    fs.writeFileSync(path.join(process.cwd(), "doops.dat"), "");
    readline.question("Who is this (github username is good, just for naming your files for the library)\n", (nameIn) => {
        user = nameIn;
        readline.question("Local or DAT: ", (choice) => {
            readLast();
            if (!fs.existsSync("groove0")) {
                createExportFolder("spotify");
                createExportFolder("groove");
                createExportFolder("musicbee");
            }
            if (choice.toLowerCase().trim() === "dat") {
                fs.readdirSync(process.cwd()).forEach(filder => {
                    if (filder.includes('.dat') && !filder.includes("all.dat") && !filder.includes("doops.dat")) {
                        downloadAlbumsFromFile(filder).then(() => {
                            console.log("\nFinished downloading.");
                            //setupExport();
                            process.exit(0);
                        }).catch((e) => {
                            console.error(e);
                            //setupExport();
                            process.exit(1);
                        });
                    }
                });
            } else if (choice.toLowerCase().trim().charAt(0) === "l") {
                readline.question('Where are your music files? (fully qualified dir pls)\n', loc => {
                    if (fs.lstatSync(loc).isDirectory())
                        locateMP3FromFolder(loc).then((resolver) => {
                            console.log(`All done from ${resolver} ${guysdone} (${guysFailed})`);
                            //setupExport();
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
        let data = fs.readFileSync(file).toString().split("\n");

        function lol(windex) {
            const line = data[windex];
            const allTheExtraStuff = line.replace('\r', '').split('==').filter(thing => thing !== "");
            const album = allTheExtraStuff.shift();
            const link = allTheExtraStuff.shift().replace('\r', '');
            if (!completed.includes(album + allTheExtraStuff.join('')))
                downloadImageFromWeb(cleanUp(album), cleanUp(allTheExtraStuff.join('')), link).then((res) => {
                    writeOverwritable(`Downloaded album cover (${windex}) : ` + album);
                    fs.appendFileSync(path.join(process.cwd(), "all.dat"), album + (allTheExtraStuff.length > 0 ? "==" + allTheExtraStuff.join('==') : "") + "\r\n");
                    appendSingleton(album, allTheExtraStuff).then(() => {
                        if (++windex === data.length)
                            resolve();
                        else
                            lol(windex);
                    });
                }).catch((thing) => {
                    if (++windex === data.length)
                        resolve();
                    else
                        lol(windex);
                });
            else if (++windex === data.length)
                resolve();
            else
                lol(windex);
        }

        lol(0);
    });
}

function downloadImageFromWeb(albumName, artist, url) {
    return new Promise((resolve, reject) => {
        writeOverwritable(`I'm downloading ` + url);
        let p = spawn("curl", [url]);
        let out = fs.createWriteStream(path.join(process.cwd(), "images/" + cleanUp(albumName) + cleanUp(artist) + ".jpg"));
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
    return new Promise((resolve, reject) => {
        for (const file of fs.readdirSync(folder)) {
            if (fs.lstatSync(folder + '\\' + file).isDirectory())
                locateMP3FromFolder(folder + '\\' + file).then(() => {
                    if (fetchedAlbums === expectedAlbums)
                        resolve();
                }).catch(reject);
            else if ((folder + '\\' + file).match(/(.mp3$)|(.flac$)/)) {
                expectedAlbums++;
                fetchAlbumsFromMP3(folder, file).then(thing => {
                    if (completed.includes(thing.tags.album + thing.tags.artist)) {
                        if (++fetchedAlbums === expectedAlbums)
                            resolve();
                        return;
                    }
                    guysdone++;
                    if (!thing.tags.picture) {
                        if (thing.tags !== {} && thing.tags.album.length > 0 && thing.tags.album.trim() !== "Unknown Album") {
                            new Promise((resolve1, reject1) => {
                                if (albumsAskedFor.includes(thing.tags.album)) {
                                    resolve1();
                                    return;
                                }
                                albumsAskedFor.push(thing.tags.album);
                                findCoverFromApple(thing.tags.album, thing.tags.artist.substring(0, 8)).then((url = "") => {
                                    downloadImageFromWeb(thing.tags.album, thing.tags.artist, url).then((res) => {
                                        completed.push(thing.tags.album + thing.tags.artist);
                                        fs.appendFileSync(path.join(process.cwd(), "all.dat"), thing.tags.album + (thing.tags.artist ? "==" + thing.tags.artist : "") + "\r\n");
                                        appendSingleton(thing.tags.album, thing.tags.artist ? [thing.tags.artist] : [])
                                            .then(() => resolve1(res)).catch(reject1);
                                    }).catch(() => {
                                        resolve1();
                                    });
                                }).catch((reason) => {
                                    reject1("Could not download art for " + thing.tags.album, reason);
                                });
                            }).then(() => {
                                if (++fetchedAlbums === expectedAlbums)
                                    resolve();
                            }).catch(() => {
                                if (++fetchedAlbums === expectedAlbums)
                                    resolve();
                            });
                        } else if (fetchedAlbums === --expectedAlbums)
                            resolve();
                    } else {
                        const {data, format} = thing.tags.picture;
                        fs.writeFileSync(path.join(process.cwd(), "images/" + cleanUp(thing.tags.album) + cleanUp(thing.tags.artist) + "_raw.jpg"), Buffer.from(data));
                        completed.push(thing.tags.album + thing.tags.artist);
                        fs.appendFileSync(path.join(process.cwd(), "all.dat"), thing.tags.album + (thing.tags.artist ? "==" + thing.tags.artist : "") + "\r\n");
                        resizer(path.join(process.cwd(), "images/" + cleanUp(thing.tags.album) + cleanUp(thing.tags.artist) + "_raw.jpg")).resize({
                            height: 512,
                            width: 512
                        }).toFile(path.join(process.cwd(), "images/" + cleanUp(thing.tags.album) + cleanUp(thing.tags.artist) + ".jpg")).then(() => {
                            appendSingleton(thing.tags.album, thing.tags.artist ? [thing.tags.artist] : []).then(() => {
                                fs.unlinkSync(path.join(process.cwd(), "images/" + cleanUp(thing.tags.album) + cleanUp(thing.tags.artist ? thing.tags.artist : "") + "_raw.jpg"));
                                fs.unlinkSync(path.join(process.cwd(), "images/" + cleanUp(thing.tags.album) + cleanUp(thing.tags.artist ? thing.tags.artist : "") + ".jpg"));
                                if (++fetchedAlbums === expectedAlbums)
                                    resolve();
                            }).catch(console.error);
                        }).catch(() => {
                            if (++fetchedAlbums === expectedAlbums)
                                resolve();
                        });
                    }
                }).catch(e => {
                    console.error(`Something went wrong reading art from ${file} `, e);
                    if (fetchedAlbums === --expectedAlbums)
                        resolve();
                });
            }
        }
        if (fetchedAlbums === expectedAlbums)
            resolve();
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

function appendSingleton(image, otherStuff = []) {
    return new Promise((resolve1, reject1) => {
        new Promise((resolve, reject) => {
            let expected_resolves = 0;
            let local_resolves = 0;
            for (let vers = 0; vers <= version; vers++) {
                if (fs.existsSync(path.join(process.cwd(), "groove" + vers))) {
                    for (let img = 0; img < 300; img++) {
                        if (fs.existsSync(path.join(process.cwd(), "groove" + vers, img + '.jpg'))) {
                            expected_resolves++;
                            areTwoPicsTheSame(path.join(process.cwd(), "groove" + vers, img + '.jpg'), path.join(process.cwd(), "images/" + cleanUp(image) + cleanUp(otherStuff.join('')) + ".jpg")).then((returned) => {
                                local_resolves++;
                                if (returned) {
                                    fs.appendFileSync(path.join(process.cwd(), "doops.dat"), `${image} by ${otherStuff.join(', ')}<=>${vers}/${img}.jpg\n`);
                                    resolve({folder: vers, imageNum: img});
                                } else if (local_resolves === expected_resolves)
                                    resolve();
                            }).catch(reject);
                        }
                    }
                }
            }
            if (expected_resolves === 0)
                resolve();
        }).then((folder) => {
            if (folder && folder.imageNum) {
                console.log(`Saved another duplicate (${++totalSavings})`);

                function doTheThing(player) {
                    let lel = fs.readFileSync(findDat(player, folder.folder)).toString().split('\n');
                    let windex = lel.indexOf(lel.find(line => line.includes(image + '==' + folder.imageNum)));
                    if (windex && windex !== -1)
                        lel[windex] = lel[windex].replace('\r', '') + '==' + otherStuff.join('==');
                    else
                        lel[lel.length - 1] = (image + "==" + (folder.imageNum) + (otherStuff.length > 0 ? ('==' + otherStuff.join('==')) : "") + '\r\n');
                    fs.writeFileSync(findDat(player, folder.folder), lel.join('\n'));
                }

                doTheThing("groove");
                doTheThing("spotify");
                doTheThing("musicbee");
            } else {
                fs.copyFileSync(path.join(process.cwd(), "images/" + cleanUp(image) + cleanUp(otherStuff.join('')) + ".jpg"), path.join(process.cwd(), "spotify" + version + "/" + amountExported + ".jpg"));
                fs.copyFileSync(path.join(process.cwd(), "images/" + cleanUp(image) + cleanUp(otherStuff.join('')) + ".jpg"), path.join(process.cwd(), "groove" + version + "/" + amountExported + ".jpg"));
                fs.copyFileSync(path.join(process.cwd(), "images/" + cleanUp(image) + cleanUp(otherStuff.join('')) + ".jpg"), path.join(process.cwd(), "musicbee" + version + "/" + amountExported + ".jpg"));
                fs.appendFileSync(findDat("spotify", version), image + "==" + (amountExported) + (otherStuff.length > 0 ? ('==' + otherStuff.join('==')) : "") + '\r\n');
                fs.appendFileSync(findDat("groove", version), image + "==" + (amountExported) + (otherStuff.length > 0 ? ('==' + otherStuff.join('==')) : "") + '\r\n');
                fs.appendFileSync(findDat("musicbee", version), image + "==" + (amountExported) + (otherStuff.length > 0 ? ('==' + otherStuff.join('==')) : "") + '\r\n');
                amountExported++;
                if (amountExported > 296) {
                    amountExported = 0;
                    version++;
                    createExportFolder("spotify");
                    createExportFolder("groove");
                    createExportFolder("musicbee");
                }
            }
            resolve1();
        }).catch(reject1);
    });
}

function cleanUp(instring="") {
    return instring.replace(/[\\/?:<>|"*]/g, '');
}

function createExportFolder(playerName) {
    killDirectory(path.join(process.cwd(), playerName + version));
    fs.mkdirSync(path.join(process.cwd(), playerName + version));
    fs.copyFileSync(path.join(process.cwd(), "assets/paused.jpg"), path.join(process.cwd(), playerName + version + "/paused.png"));
    fs.copyFileSync(path.join(process.cwd(), "assets/" + playerName + "_small.png"), path.join(process.cwd(), playerName + version + "/" + playerName + "_small.png"));
    fs.copyFileSync(path.join(process.cwd(), "assets/" + playerName + ".png"), path.join(process.cwd(), playerName + version + "/" + playerName + ".png"));
    switch (playerName) {
        case 'spotify':
            fs.writeFileSync(path.join(process.cwd(), "spotify" + version + "/" + user + "spotify" + startTime + version + ".dat"), "spotify=spotify\nid=\n");
            break;
        case 'groove':
            fs.writeFileSync(path.join(process.cwd(), "groove" + version + "/" + user + "groove" + startTime + version + ".dat"), "music.ui=groove\nid=\n");
            break;
        case 'musicbee':
            fs.writeFileSync(path.join(process.cwd(), "musicbee" + version + "/" + user + "musicbee" + startTime + version + ".dat"), "musicbee=musicbee\nid=\n");
            break;
    }
}

function addImageKey(playerName, version, startTime, image, windex, extraStuff = []) {
    fs.appendFileSync(path.join(process.cwd(), playerName + version + "/" + user + playerName + startTime + version + ".dat"), image + '==' + windex + (extraStuff.length > 0 ? "==" + extraStuff.join('==') : "") + '\n');
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

function readLast() {
    if (fs.existsSync(path.join(process.cwd(), "archive"))) {
        fs.readdirSync(path.join(process.cwd(), "archive"))
            .forEach((file) => {
                fs.readFileSync(path.join(process.cwd(), "archive", file)).toString().split('\n').forEach(line => {
                    line = line.replace('\r', '');
                    if (line.includes('=='))
                        completed.push(line.split('==')[0] + (line.split('==').length > 2 ? line.split('==').splice(2).join("") : ""));
                });
            });
    }
    while (fs.existsSync(path.join(process.cwd(), "groove" + (++version)))) {
        amountExported = 0;
        fs.readdirSync(path.join(process.cwd(), "groove" + version)).forEach(file => {
            if (file.includes('.dat')) {
                fs.readFileSync(path.join(process.cwd(), "groove" + version, file)).toString().split('\n').forEach(line => {
                    line = line.replace('\r', '');
                    if (line.split('==').length > 1) {
                        completed.push(line.split('==')[0] + line.split('==').splice(2).join(""));
                        amountExported++;
                    }
                });
            }
        });
    }
    version = Math.max(version - 1, 0);
}

function findDat(player, vers) {
    return path.join(process.cwd(), player + vers, fs.readdirSync(path.join(process.cwd(), player + vers)).find(file => file.includes('.dat')));
}

process.on('unhandledRejection', (reason, p) => {
    console.trace('Unhandled Rejection at: Promise', p, 'reason:', reason);
});