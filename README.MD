# Welcome to the community MDRP library
This is where the community can contribute their album arts or borrow ones that have already been created!

## Getting started
0. You might want to check out [MDRP](https://github.com/jojo2357/Music-Discord-Rich-Presence) first ;)
1. Clone this repository and unzip
2. Run the exectuable provided (note: if you have node you can run the source file instead)
3. Provide your github username (or just any old name if you dont plan to contribute)
4. enter `mp3` (dat is not currently supported but hopefully will soon. That is how spotify playlist downloading will work)
5. enter the root directory of your music (example: `C:\Users\Admin\Music`)
6. Let the magic happen. 
7. [Go to discord](https://discord.com/developers/applications) and create an application for each folder and name it either spotify/groove/musicbee (this so it shows up as playing spotify, etc).
8. Choose a folder, select all the images and upload them into the art assets
9. Take the client id and paste it in the dat file in that folder.
10. Move the dat file to your `clientdata` folder for MDRP and enjoy the rich presence!

## Rerunning
If you get more mp3's, then im sorry theres gonna be some issues involving overwriting. I will fix this when i get the chance.

## Contributing to the library
Unfortunately, there are people that like to be mean and since I cant control/moderate applications created by third parties, the only way I can guarantee the validity of uploaded clientdata folders is to create the applicaitons myself. However, I will try to acommodate everyone.
0. [Create a fork](https://docs.github.com/en/github/getting-started-with-github/fork-a-repo) of this repo and [Get Started](https://github.com/jojo2357/Music-Discord-Rich-Presence-Library#getting-started) from step 2 up to step 6.
1. Make a folder under `Pending_User_Files` matching your github username that you definitely used when u ran the program :eyes:
2. Move all of the generated folders there.
3. Open a PR to [this repository](https://github.com/jojo2357/Music-Discord-Rich-Presence) (linked just in case you are reading this in a fork)
4. Wait for me to do the do. Once i do the do, you will be able to find your generated files under `User_Generated_Files/<your username>`. 
5. Move the dat files i made into your `clientdata` folder in MDRP.