const {spawn} = require('child_process');
const readline = require('readline').createInterface({
    input: process.stdin,
    output: process.stdout
});
const fs = require("fs");
const jsmediatags = require("jsmediatags");
const path = require("path");
const resemble = require("resemblejs/compareImages");

const startTime = new Date().getTime();

const imageProcessingThreads = 10;

let version = -1;
let amountExported = 0;
let totalSavings = 0;
let threshold = 10;

let guysdone = 0;
let guysFailed = 0;
let fetchedAlbums = 0;
let expectedAlbums = 0;
let completed = [];
let albumsAskedFor = [];

const exportFile = `MDRP_Local_Library_${Date.now()}.dat`;

Main();

function areTwoPicsTheSame(location1, location2) {
    const options = {
        returnEarlyThreshold: threshold,
        ignore: "antialiasing",
        scaleToSameSize: true
    };

    // The parameters can be Node Buffers
    // data is the same as usual with an additional getBuffer() function
    return new Promise((resolve, reject) => {
        resemble(
            fs.readFileSync(location1),
            fs.readFileSync(location2),
            options
        ).then(data => {
            /*if (data.rawMisMatchPercentage < threshold)
                console.log("winner: " + data.rawMisMatchPercentage);*/
            resolve(data.rawMisMatchPercentage < threshold);
        }).catch((whatev) => {
            reject(whatev);
        });
    });
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

let appleStack = [];

function doNextAppleRequest() {
    /*if (appleStack.length === 0)
        process.exit(0);*/
    writeOverwritable("Pending Requests: " + appleStack.length + " remaining (" + (appleStack.length * 4 / 60).toFixed(0).padStart(2, "0") + ":" + (appleStack.length * 4 % 60).toFixed(1).padStart(4, "0") + " left)");
    setTimeout(() => {
        if (appleStack.length > 0) {
            let thing = appleStack[0];
            executeCoverFromApple(thing.name, thing.artistName).then((res) => {
                thing.promise.resolve(res);
            }).catch((msg) => {
                if (msg === "Nope") {
                    console.error("response was empty        ");
                } else {
                    console.error("Failed to locate " + thing.name + " ".repeat(10));
                }
                thing.promise.reject();
            });
            appleStack.splice(0, 1);
            doNextAppleRequest();
        }
    }, 4000);
}

function findCoverFromApple(albumName = "Origins", artistName = "") {
    let obj = {};
    var resolve, reject;
    obj.promise = new Promise((resolve1, reject1) => {
        resolve = resolve1;
        reject = reject1;
    });
    obj.promise.resolve = resolve;
    obj.promise.reject = reject;
    obj.name = albumName;
    obj.artistName = artistName;
    appleStack.push(obj);
    if (appleStack.length === 1)
        doNextAppleRequest();
    return obj.promise;
}

function executeCoverFromApple(albumName = "Origins", artistName = "") {
    return new Promise((resolve, reject) => {
        let out = '';
        let http = `https://itunes.apple.com/search?term=${encodeURI(albumName)}&media=music&country=us&entity=album&limit=200`;
        //console.log("Querying " + http);
        let req = spawn("curl", [http]);

        req.stdout.on('data', (data) => {
            out += data.toString();
        });

        req.on('exit', (obj, other) => {
            //console.log("query finnished");
            let json;
            try {
                json = JSON.parse(out);
                if (json.resultCount === 0)
                    reject("No chance");
                else {
                    let album = json.results;//.filter((listing) => (listing.artistName + "").toLowerCase().includes(artistName.toLowerCase()));
                    if (album.length === 0)
                        reject("Nope");
                    else {
                        let resolution = [];
                        album.forEach(item => {
                            resolution.push({
                                album: item.collectionName,
                                artist: item.artistName,
                                link: item.artworkUrl100,//.replace("100x100", "512x512"),
                            })
                        });
                        resolve(resolution);
                    }
                }
            } catch (e) {
                reject();
            }
        });
    });

}

function Main() {
    if (!fs.existsSync("questionedImages"))
        fs.mkdirSync("questionedImages");
    if (!fs.existsSync("foundImages"))
        fs.mkdirSync("foundImages");
    if (!fs.existsSync("questionableImages"))
        fs.mkdirSync("questionableImages");
    if (!fs.existsSync("images"))
        fs.mkdirSync("images");
    readline.question('Where are your music files? (fully qualified dir pls)\n', loc => {
        if (fs.lstatSync(loc).isDirectory()) {
            locateMP3FromFolder(loc);
            grindTheNewGrind().then(() => {
                process.exit(0);
            });
        } else
            console.log("I can't find this.");
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

function downloadImageFromWeb(albumName, artist, url, folder = "images") {
    return new Promise((resolve, reject) => {
        //writeOverwritable(`I'm downloading ` + url);
        let p = spawn("curl", [url]);
        let out = fs.createWriteStream(path.join(process.cwd(), folder, cleanUp(albumName) + cleanUp(artist) + ".jpg"));
        p.stdout.pipe(out);
        p.on("exit", (code) => {
            if (code === 0)
                resolve(path.join(process.cwd(), folder, cleanUp(albumName) + cleanUp(artist) + ".jpg"));
            else
                reject(code);
        });
    });
}

let files = [];

function locateMP3FromFolder(folder) {
    for (const file of fs.readdirSync(folder)) {
        if (fs.lstatSync(folder + path.sep + file).isDirectory())
            locateMP3FromFolder(folder + path.sep + file);
        else if ((folder + path.sep + file).match(/(.mp3$)|(.flac$)/)) {
            files.push(folder + path.sep + file);
        }
    }
}

function grindTheNewGrind() {
    expectedAlbums = files.length;
    return new Promise((resolve, reject) => {
        const expectedResolves = files.length;
        let seenResolves = 0;
        for (var i = 0; i < files.length; i++) {
            newgrind(i).then(() => {
                if (++seenResolves === expectedResolves)
                    resolve();
            }).catch(() => {
                if (++seenResolves === expectedResolves)
                    resolve();
            });
        }
    });
}

function downloadImageFromWebAndVerify(album, artist, picture, url = [], questionableImages = "images") {
    return new Promise(async function (resolve, reject)  {
        const {data, format} = picture;
        fs.writeFileSync(path.join(process.cwd(), "foundImages/" + cleanUp(album) + cleanUp(artist ? artist : "") + "_raw.jpg"), Buffer.from(data));
        for (var i = 0; i < url.length; i++) {
            var location = await downloadImageFromWeb(album, artist, url[i].link, questionableImages);
            var res = await areTwoPicsTheSame(location, path.join(process.cwd(), "foundImages/" + cleanUp(album) + cleanUp(artist ? artist : "") + "_raw.jpg"));
            if (res) {
                resolve(location);
                return;
            }
        }
        resolve(undefined);
    });
}

function newgrind(myIndex = -1, file = files[myIndex]) {
    return new Promise((resolve2, reject2) => {
        new Promise((resolve, reject) => {
            fetchAlbumsFromMP3(file).then(tags => {
                const musicData = tags.tags;
                if (completed.includes(musicData.album + musicData.artist)) {
                    resolve();
                    return;
                }
                guysdone++;
                if (musicData !== {} && musicData.album && musicData.album.length > 0 && musicData.album.trim() !== "Unknown Album") {
                    new Promise((resolve1, reject1) => {
                        if (albumsAskedFor.includes(musicData.album)) {
                            resolve1();
                            return;
                        }
                        albumsAskedFor.push(musicData.album);
                        findCoverFromApple(musicData.album, musicData.artist.substring(0, 8)).then((url = []) => {
                            if (!musicData.picture) {
                                let bestUrl = "";
                                if (url.filter((item) => {
                                    return item.artistName === musicData.artist;
                                }).length === 1)
                                    bestUrl = url.find((item) => {
                                        return item.artistName === musicData.artist;
                                    }).link;
                                else if (url.filter((item) => {
                                    return item.album === musicData.album;
                                }).length === 1)
                                    bestUrl = url.find((item) => {
                                        return item.album === musicData.album;
                                    });
                                else
                                    bestUrl = url[0].link;
                                downloadImageFromWeb(musicData.album, musicData.artist, bestUrl, "questionedImages").then((res) => {
                                    completed.push(musicData.album + musicData.artist);
                                    fs.appendFileSync(path.join(process.cwd(), "all.dat"), musicData.album + (musicData.artist ? "==" + musicData.artist : "") + "\r\n");
                                    appendNewSingleton(musicData.album, musicData.artist ? [musicData.artist] : [], bestUrl);
                                    resolve1(res);
                                }).catch(() => {
                                    resolve1();
                                });
                            } else {
                                downloadImageFromWebAndVerify(musicData.album, musicData.artist, musicData.picture, url, "questionableImages").then((res) => {
                                    if (res) {
                                        completed.push(musicData.album + musicData.artist);
                                        fs.appendFileSync(path.join(process.cwd(), "all.dat"), musicData.album + (musicData.artist ? "==" + musicData.artist : "") + "\r\n");
                                        appendNewSingleton(musicData.album, musicData.artist ? [musicData.artist] : [], res);
                                        fs.unlinkSync(path.join(process.cwd(), "questionableImages", cleanUp(musicData.album) + cleanUp(musicData.artist) + ".jpg"))
                                    } else {
                                        console.log("Confirmed wrong art for " + musicData.album);
                                        fs.appendFileSync(path.join(process.cwd(), "incorrectAlbums.dat"), musicData.album + (musicData.artist ? "==" + musicData.artist : "") + "\r\n");
                                    }
                                    resolve1(res);
                                }).catch(() => {
                                    resolve1();
                                });
                            }
                        }).catch((reason) => {
                            fs.appendFileSync(path.join(process.cwd(), "fails.dat"), musicData.album + (musicData.artist ? "==" + musicData.artist : "") + "\r\n");
                            reject1("Could not download art for " + musicData.album, reason);
                        });
                    }).then(() => {
                        resolve(myIndex);
                    }).catch(() => {
                        resolve(myIndex);
                    });
                }else
                    resolve(myIndex);
            }).catch(e => {
                console.error(`Something went wrong reading art from ${file} `, e);
                resolve(myIndex);
            });
        }).then(() => {
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

function appendNewSingleton(image, otherStuff = [], url) {
    fs.appendFileSync(exportFile, image + "==" + (url) + (otherStuff.length > 0 ? ('==' + otherStuff.join('==')) : "") + '\r\n');
}

function cleanUp(instring = "") {
    return instring.replace(/[\\/?:<>|"*]/g, '');
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