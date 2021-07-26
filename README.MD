# Welcome to the community MDRP library
This is where the community can contribute their album arts or borrow ones that have already been created!

## Getting started
0. You might want to check out [MDRP](https://github.com/jojo2357/Music-Discord-Rich-Presence) first ;)
1. Clone this repository and unzip
2. Run the exectuable provided (note: if you have node you can run the source file instead)
3. Provide your github username (or just any old name if you dont plan to contribute)
### For local music Files
4. enter `local` (works for `.mp3` and `.flac`. Unfortunately `.m4a` cannot be supported at this time)
5. enter the root directory of your music (example: `C:\Users\Admin\Music`)
*continue to step 6*
### For [Website Generated dat files](https://mdrp.tech/fetchalbumart/)
4. Use the spotify tool to get a printout of all the albums in your playlists and ensure that dat file is in the same folder as the exe
5. Enter `dat`

6. Let the magic happen. 
7. You can postverify if internet usage is a concern. This will do its best to remove duplicated album arts, but is slow. This step used to take place alongside image processing but that was excessivly costly. Just look at issue #20
8. [Go to discord](https://discord.com/developers/applications) and create an application for each folder and name it either spotify or groove or musicbee (this so it shows up as playing spotify, etc).
9. Choose a folder, select all the images (shift+arrow keys) and upload them into the art assets
10. Take the client id and paste it in the dat file in that folder.
11. Move the dat file to your `clientdata` folder for MDRP and enjoy the rich presence! (You will have to restart MDRP)

## Rerunning
Place processed dat files inside the `archives` folder

## Contributing to the library
Unfortunately, there are people that like to be mean and since I cant control/moderate applications created by third parties, the only way I can guarantee the validity of uploaded clientdata folders is to create the applicaitons myself. However, I will try to acommodate everyone.
0. [Create a fork](https://docs.github.com/en/github/getting-started-with-github/fork-a-repo) of this repo and [Get Started](https://github.com/jojo2357/Music-Discord-Rich-Presence-Library#getting-started) from step 2 up to step 6.
1. Make a folder under `Pending_User_Files` matching your github username that you definitely used when u ran the program :eyes:
2. Move all of the generated folders there.
3. Open a PR to [this repository](https://github.com/jojo2357/Music-Discord-Rich-Presence-Library) (linked just in case you are reading this in a fork)
4. Wait for me to do the do. Once i do the do, you will be able to find your generated files under `User_Generated_Files/<your username>`. 
5. Move the dat files i made into your `clientdata` folder in MDRP.