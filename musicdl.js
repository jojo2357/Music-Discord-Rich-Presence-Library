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

const imageProcessingThreads = 100;
const postverificationThreadCount = 50;

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
        /*if (data.rawMisMatchPercentage < threshold)
            console.log("winner: " + data.rawMisMatchPercentage);*/
        resolve(data.rawMisMatchPercentage < threshold);
    }).catch((whatev) => {
        reject(whatev);
    }));
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
                //createExportFolder("apple music")
            }
            if (choice.toLowerCase().trim() === "dat") {
                fs.readdirSync(process.cwd()).forEach(filder => {
                    if (filder.includes('.dat') && !filder.includes("all.dat") && !filder.includes("doops.dat")) {
                        downloadAlbumsFromFile(filder).then(() => {
                            readline.question(`\nFinished downloading. Would you like to postverify (postverify checks and deletes duplicates, can use a LOT of cpu and time, but saves bandwidth on upload and hard drive space. You have been warned)? Y/N\n`, loc => {
                                if (loc.toLowerCase().charAt(0) === 'y') postVerify();
                            });
                        }).catch((e) => {
                            console.error(e);
                            //setupExport();
                            process.exit(1);
                        });
                    }
                });
            } else if (choice.toLowerCase().trim().charAt(0) === "l") {
                readline.question('Where are your music files? (fully qualified dir pls)\n', loc => {
                    if (fs.lstatSync(loc).isDirectory()) {
                        locateMP3FromFolder(loc);
                        grindTheGrind().then(() => {
                            readline.question(`\nAll done ${guysdone} (${guysFailed}). Would you like to postverify (postverify checks and deletes duplicates, can use a LOT of cpu and time, but saves bandwidth on upload and hard drive space. You have been warned)? Y/N\n`, loc => {
                                if (loc.toLowerCase().charAt(0) === 'y') postVerify();
                            });
                            //process.exit(0);
                        });
                    } else
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

let files = [];

function locateMP3FromFolder(folder) {
    for (const file of fs.readdirSync(folder)) {
        if (fs.lstatSync(folder + '\\' + file).isDirectory())
            locateMP3FromFolder(folder + '\\' + file);
        else if ((folder + '\\' + file).match(/(.mp3$)|(.flac$)/)) {
            files.push(folder + '\\' + file);
        }
    }
}

function grind(myIndex = -1, file = files[myIndex]) {
    return new Promise((resolve2, reject2) => {
        new Promise((resolve, reject) => {
            fetchAlbumsFromMP3(file).then(thing => {
                if (completed.includes(thing.tags.album + thing.tags.artist)) {

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
                            resolve(myIndex);
                        }).catch(() => {
                            resolve(myIndex);
                        });
                    }
                    resolve(myIndex);
                } else {
                    const {data, format} = thing.tags.picture;
                    fs.writeFileSync(path.join(process.cwd(), "images/" + cleanUp(thing.tags.album) + cleanUp(thing.tags.artist ? thing.tags.artist : "") + "_raw.jpg"), Buffer.from(data));
                    completed.push(thing.tags.album + thing.tags.artist);
                    fs.appendFileSync(path.join(process.cwd(), "all.dat"), thing.tags.album + (thing.tags.artist ? "==" + thing.tags.artist : "") + "\r\n");
                    resizer(path.join(process.cwd(), "images/" + cleanUp(thing.tags.album) + cleanUp(thing.tags.artist ? thing.tags.artist : "") + "_raw.jpg")).resize({
                        height: 512,
                        width: 512
                    }).toFile(path.join(process.cwd(), "images/" + cleanUp(thing.tags.album) + cleanUp(thing.tags.artist ? thing.tags.artist : "") + ".jpg")).then(() => {
                        appendSingleton(thing.tags.album, thing.tags.artist ? [thing.tags.artist] : []).then(() => {
                            setTimeout(() => {
                                fs.unlinkSync(path.join(process.cwd(), "images/" + cleanUp(thing.tags.album) + cleanUp(thing.tags.artist ? thing.tags.artist : "") + "_raw.jpg"));
                                fs.unlinkSync(path.join(process.cwd(), "images/" + cleanUp(thing.tags.album) + cleanUp(thing.tags.artist ? thing.tags.artist : "") + ".jpg"));

                                resolve(myIndex);
                            }, 500);
                        }).catch(console.error);
                    }).catch(() => {
                        resolve(myIndex);
                    });
                }
            }).catch(e => {
                console.error(`Something went wrong reading art from ${file} `, e);
                resolve(myIndex);
            });
        }).then(() => {
            if (myIndex + imageProcessingThreads < files.length)
                grind(myIndex + imageProcessingThreads, files[myIndex + imageProcessingThreads]).then(resolve2);
            else
                resolve2();
        });
    });
}

function grindTheGrind() {
    expectedAlbums = files.length;
    return new Promise((resolve, reject) => {
        const expectedResolves = Math.min(imageProcessingThreads, files.length);
        let seenResolves = 0;
        for (var i = 0; i < Math.min(imageProcessingThreads, files.length); i++) {
            grind(i).then(() => {
                if (++seenResolves === expectedResolves)
                    resolve();
            }).catch(() => {
                if (++seenResolves === expectedResolves)
                    resolve();
            });
        }
    });
}

function fetchAlbumsFromMP3(file) {
    return new Promise((resolve, reject) => {
        new jsmediatags.Reader(file)
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

let windexA = 0, windexB = 0, pendingCompletions = 0;

function spawnPendingVerificationThreads() {
    for (; pendingCompletions > 0; pendingCompletions--) {
        if (windexA + 1 < Math.min(windexB, existingCombinations)) {
            windexA += 1;
        } else {
            windexB += 1;
            windexA = 0;
        }
        if (windexB >= existingCombinations)
            notifyVerificationThreadTermination();
        else
            checkSimilar(windexA, windexB);
    }
}

let runningThreads = 0, completedThreads = 0;

function notifyVerificationThreadTermination() {
    if (++completedThreads === runningThreads) {
        console.log("\nPostverified. All done. Saved " + totalSavings + " images");
        process.exit(0);
    } else{
        console.log("Thread #" + completedThreads + " terminated, " + runningThreads + " still running");
    }
}

function estimatePostVerification() {
    for (var i = 0; ; i++)
        if (fs.existsSync(path.join(process.cwd(), "groove" + i)))
            for (var j = 0; j < 300; j++)
                if (fs.existsSync(path.join(process.cwd(), "groove" + i, j + '.jpg')))
                    existingMap.push({folder: i, image: j});
                else ;
        else
            break;
    existingCombinations = existingMap.length;
    console.log("I estimate there are " + (existingCombinations * (existingCombinations + 1) / 2) + " comparisons to make");
    return existingCombinations * (existingCombinations + 1) / 2;
}

let postVerificationCount = -1, postVerified = 0;

function checkSimilar(index, index1) {
    let img1, versa, img, vers;
    img1 = existingMap[index].image;
    img = existingMap[index1].image;
    versa = existingMap[index].folder;
    vers = existingMap[index1].folder;
    if (fs.existsSync(path.join(process.cwd(), "groove" + versa)) && fs.existsSync(path.join(process.cwd(), "groove" + vers)) && fs.existsSync(path.join(process.cwd(), "groove" + versa, img1 + '.jpg')) && fs.existsSync(path.join(process.cwd(), "groove" + vers, img + '.jpg'))) {
        process.stdout.write((100 * postVerified++ / postVerificationCount).toFixed(0) + "% (" + postVerified + ") " + ".".repeat(postVerified % 3) + "     \r");
        areTwoPicsTheSame(path.join(process.cwd(), "groove" + vers, img + '.jpg'), path.join(process.cwd(), "groove" + versa, img1 + '.jpg')).then((returned) => {
            if (returned) {
                ++totalSavings;

                function doTheThing(player = "groove") {
                    let lel = fs.readFileSync(findDat(player, vers)).toString().split('\n');
                    let windex = lel.indexOf(lel.find(line => line && line !== "" && line.match(new RegExp(`(==${img}$)|(==${img}==)`))));
                    if (vers !== versa) {
                        let lel1 = fs.readFileSync(findDat(player, versa)).toString().split('\n');
                        let otherStuff = lel1.find(line => line && line !== "" && line.match(new RegExp(`(==${img1}$)|(==${img1}==)`))).split(`==`);
                        if (lel[windex].split('==')[0] === otherStuff[0]) {
                            lel[windex] = lel[windex].replace('\r', '') + '==' + otherStuff.splice(2).join(`==`);
                        } else {
                            lel1.splice(lel1.indexOf(lel1.find(line => line.match(new RegExp(`(==${img1}$)|(==${img1}==)`)))), 1);
                            otherStuff[1] = img;
                            lel.push(otherStuff.join('=='));
                        }
                        fs.writeFileSync(findDat(player, vers), lel.join('\n'));
                        fs.writeFileSync(findDat(player, versa), lel1.join('\n'));
                        fs.unlinkSync(path.join(process.cwd(), player + vers, img + '.jpg'));
                    } else {
                        try {
                            let otherStuff = lel.find(line => line && line !== "" && line.match(new RegExp(`(==${img1}$)|(==${img1}==)`))).split(`==`);
                            if (lel[windex].split('==')[0] === otherStuff[0]) {
                                lel[windex] = lel[windex].replace('\r', '') + '==' + otherStuff.splice(2).join(`==`);
                                lel.splice(lel.indexOf(lel.find(line => line.match(new RegExp(`(==${img1}$)|(==${img1}==)`)))), 1);
                            } else {
                                lel.splice(lel.indexOf(lel.find(line => line.match(new RegExp(`(==${img1}$)|(==${img1}==)`)))), 1);
                                otherStuff[1] = img;
                                lel.push(otherStuff.join('=='));
                            }
                            fs.writeFileSync(findDat(player, vers), lel.join('\n'));
                            fs.unlinkSync(path.join(process.cwd(), player + versa, img1 + '.jpg'));
                        }catch (thing) {
                            console.log("This thread is sad. Send this to jojo2357: ", lel, img, vers, img1, versa);
                        }
                    }
                }

                doTheThing("groove");
                doTheThing("spotify");
                doTheThing("musicbee");
                //doTheThing("apple music")
            }
            pendingCompletions++;
            setImmediate(spawnPendingVerificationThreads);
        }).catch(console.error);
    } else {
        pendingCompletions++;
        setImmediate(spawnPendingVerificationThreads);
    }
}

let existingMap = [], existingCombinations = 0;

function postVerify() {
    postVerificationCount = estimatePostVerification();
    process.stdout.write((100 * postVerified / postVerificationCount).toFixed(0) + "% " + ".".repeat(postVerified % 3) + "     \r");
    pendingCompletions = postverificationThreadCount;
    runningThreads = postverificationThreadCount;
    spawnPendingVerificationThreads();
}

function appendSingleton(image, otherStuff = []) {
    return new Promise((resolve1, reject1) => {
        fs.copyFileSync(path.join(process.cwd(), "images/" + cleanUp(image) + cleanUp(otherStuff.join('')) + ".jpg"), path.join(process.cwd(), "spotify" + version + "/" + amountExported + ".jpg"));
        fs.copyFileSync(path.join(process.cwd(), "images/" + cleanUp(image) + cleanUp(otherStuff.join('')) + ".jpg"), path.join(process.cwd(), "groove" + version + "/" + amountExported + ".jpg"));
        fs.copyFileSync(path.join(process.cwd(), "images/" + cleanUp(image) + cleanUp(otherStuff.join('')) + ".jpg"), path.join(process.cwd(), "musicbee" + version + "/" + amountExported + ".jpg"));
        //fs.copyFileSync(path.join(process.cwd(), "images/" + cleanUp(image) + cleanUp(otherStuff.join('')) + ".jpg"), path.join(process.cwd(), "apple music" + version + "/" + amountExported + ".jpg"));
        fs.appendFileSync(findDat("spotify", version), image + "==" + (amountExported) + (otherStuff.length > 0 ? ('==' + otherStuff.join('==')) : "") + '\r\n');
        fs.appendFileSync(findDat("groove", version), image + "==" + (amountExported) + (otherStuff.length > 0 ? ('==' + otherStuff.join('==')) : "") + '\r\n');
        fs.appendFileSync(findDat("musicbee", version), image + "==" + (amountExported) + (otherStuff.length > 0 ? ('==' + otherStuff.join('==')) : "") + '\r\n');
        //fs.appendFileSync(findDat("apple music", version), image + "==" + (amountExported) + (otherStuff.length > 0 ? ('==' + otherStuff.join('==')) : "") + '\r\n');
        amountExported++;
        if (amountExported > 296) {
            amountExported = 0;
            version++;
            createExportFolder("spotify");
            createExportFolder("groove");
            createExportFolder("musicbee");
            //createExportFolder("apple music");
        }
        resolve1();
    });
}

function cleanUp(instring = "") {
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
        /*case 'apple music':
            fs.writeFileSync(path.join(process.cwd(), "apple music" + version + "/" + user + "apple music" + startTime + version + ".dat"), "apple music=apple music\nid=\n");
            break;*/
    }
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