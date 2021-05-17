"""
Use environment variable: `ESCAPE_ALL` to escape all symbols
                 Default: escape only those symbols which can affect markdown formatting
"""
import logging
import os
import pprint
import time
from os.path import join, isfile
from typing import Tuple, Dict, TypeVar

import requests


def find_all_dat_files():
    """
    finds all the dat files in "User_Generated_Files" folder
    :return:
    """
    all_files = []

    for dir_path, folders, file in os.walk("User_Generated_Files"):
        all_files += [join(dir_path, f) for f in file if isfile(join(dir_path, f))]

    logger.info("Found: %d files", len(all_files))

    return all_files


def get_album_and_artist(line: str) -> Tuple[str, str]:
    """
    from a `dat` file return the album and artist name from the given line.
    Returns "Unknown Artist" if artist key is not present
    :param line: the line containing the MDRP music key
    :return: 2-item tuple of format <album>, <artist>
    """
    splitted = line.split("==")

    # if artist key is not present
    if len(splitted) == 2:
        artist = "Unknown Artist"
    else:
        artist = find_multiple_artists(splitted[-1].strip("\n"))

    # Setting the album name
    album = splitted[0]

    return album, artist


def escape(string: str):
    """
    escapes the special characters with a backslash
    :param string:
    :return:
    """
    escaped_string = ""
    for letter in string:
        if not letter.isalnum() and letter != " " and (os.getenv("ESCAPE_ALL", False) or letter in "`*_-<>[]()\\"):
            logger.debug("escaping: %s \t %s", letter, string)
            escaped_string += rf"\{letter}"
        else:
            escaped_string += letter
    return escaped_string


def download_artist_exceptions_list() -> tuple:
    # Download the list of artists with a forward slash
    ARTISTS_WITH_SLASH = tuple()
    tries = 0
    while (tries := tries + 1) <= 3:
        try:
            ARTISTS_WITH_SLASH = requests.get(
                    "https://gist.githubusercontent.com/RoguedBear/b0c7028c6ca194f01218d3281644bbc0"
                    "/raw/bc4010c7fbfe3ec4fdf0e7af2adf81864a16ce14/artists.txt").text.split("\n")
        except Exception as e:
            logger.exception(e)
            logger.warning("Unable to download artist list! giving %d more tries", 4 - tries)
            time.sleep(30)
        else:
            logger.info("Artist list downloaded. Total artist on the list: %d", len(ARTISTS_WITH_SLASH))
            break
    else:
        logger.warning("Continuing w/o the artist list.")

    return tuple(ARTISTS_WITH_SLASH)


def find_multiple_artists(artist_string: str, artist_with_slash=tuple()) -> tuple:
    """
    From a given string, return the multiple artists that are present splitted by a forward slash
    by being mindful of the artists that have an forward slash in their names ofc.

    # Pseudocode:
        - go through every exception artist and check whether they exist in the string or not
        - if they do, well we have one artist to add. just make sure they're as a single word.
        - remove them from the string.
    :param artist_with_slash: optional argument to provide the list for testing purpose
    :param artist_string: the artist string
    :return: a tuple containing all the artists present in the string
    """
    artist_string_og = artist_string[:]
    ARTISTS_WITH_SLASH = globals().get("ARTISTS_WITH_SLASH", []) or artist_with_slash
    found_artists = []
    artist_string_search = list(map(lambda x: x.lower(), (artist_string := artist_string.split("/"))))
    for slash_artist in ARTISTS_WITH_SLASH:
        # split the artist by forward slash
        # get its index.
        # check whether the next letter is the same as in the exception
        # do this for as many items in the forward slash artist list.
        # if we get by the end, the artist is matched. otherwise no.
        prev_index = float("NaN")
        for part_of_name in (slash_artist_list := slash_artist.split("/")):
            # Check if part of name exists in the list and it comes right after the previous one
            if part_of_name.lower() not in artist_string_search and (
                    prev_index == float("NaN") or prev_index + 1 != slash_artist.index(part_of_name)):
                break
            else:
                prev_index = slash_artist.index(part_of_name)
        else:
            # Get the first occurring index of the artist
            first_occurrence_index = artist_string_search.index(slash_artist_list[0].lower())
            # then pop it to remove it from the artist_string list
            found_artists.append("/".join(artist_string.pop(first_occurrence_index)
                                          for _ in range(len(slash_artist_list))))
            artist_string_search = list(map(lambda x: x.lower(), artist_string))
            logger.info("Found / artist: %s", found_artists[-1])
            print("Found / artist: ", found_artists[-1])

    found_artists.extend(artist_string)
    if len(found_artists) > 1:
        logger.info("Artist \"%s\" extracted to -> \"%s\"", str(artist_string_og), str(found_artists))

    return tuple(found_artists)


class CaseInsensitiveDictionary(dict):
    pass

    _KT = TypeVar("_KT")
    _VT = TypeVar("_VT")

    def __getitem__(self, item):
        for key in self.keys():
            if key.lower() == item.lower():
                return super().__getitem__(key)

    def __contains__(self, item):
        all_keys_lower = map(lambda key: key.lower(), self.keys())
        if item.lower() in all_keys_lower:
            return True
        else:
            return False

    def setdefault(self, __key: _KT, __default: _VT = ...) -> _VT:
        for key in self.keys():
            if key.lower() == __key.lower():
                return self[key]
        else:
            self[__key] = __default
            return __default


if __name__ == '__main__':
    # Test prints
    # print(find_all_dat_files())
    # print(get_album_and_artist("Live from Vatnagarðar==16"))
    #

    # Set the logger
    # noinspection PyArgumentList
    logging.basicConfig(format="[{asctime}] :--{levelname:-^9s}--: [{funcName}()] {message}",
                        datefmt="%d/%b/%Y %H:%M:%S",
                        style="{")
    logger = logging.getLogger()
    logger.setLevel(10)

    # Get a list of all the dat files
    ALL_FILES = find_all_dat_files()

    # Download the artists list
    ARTISTS_WITH_SLASH = download_artist_exceptions_list()

    ALL_ALBUMS_WITH_ARTISTS: Dict[str, list] = CaseInsensitiveDictionary([("Unknown Artist", [])])
    stat_counter = {"total_songs": 0}
    # Go through each file.
    for dat_file in ALL_FILES:
        with open(dat_file) as f:
            # Skip the first 2 lines
            f.readline()
            f.readline()

            # Now go through each entry and store it in master dictionary
            for album_entry in f:
                album, artist_tuple = get_album_and_artist(album_entry)
                # Check if the album's entry for artist exists or not to avoid double entry
                for artist in artist_tuple:
                    if album not in ALL_ALBUMS_WITH_ARTISTS.setdefault(artist, []):
                        ALL_ALBUMS_WITH_ARTISTS[artist].append(album)
                        stat_counter["total_songs"] += 1
    logger.debug(pprint.pformat(ALL_ALBUMS_WITH_ARTISTS))

    logger.info("Found and added %d songs", stat_counter["total_songs"])

    # Now format for the markdown entry.
    MARKDOWN_CONTENT = ""

    # Go through the artist's name in alphabetical order
    sorted_artists = sorted(ALL_ALBUMS_WITH_ARTISTS.keys(), key=lambda x: x.lower())
    sorted_artists += ["Unknown Artist"] \
        if ALL_ALBUMS_WITH_ARTISTS[sorted_artists.pop(sorted_artists.index("Unknown Artist"))] \
        else []
    for artist in sorted_artists:
        # Append the artist name with level 2 headings
        MARKDOWN_CONTENT += f"## {escape(artist)}\n"

        # Now for their albums:
        for album in sorted(ALL_ALBUMS_WITH_ARTISTS[artist]):
            # Add the album name with bullet points
            MARKDOWN_CONTENT += f" - {escape(album)}\n"

    # Now write the Markdown file
    with open("Albums_in_MDRP.md", "w") as file:
        file.write("# List of Albums:\n")
        file.write("This file contains the list of all the songs that are currently added in the MDRP discord"
                   " applications.\n\n")
        file.write("---\n")

        file.write(MARKDOWN_CONTENT)
        logger.info("Created the markdown file")

    # Repeat the above part again cuz.. faszt computers ⚡⚡

    TEXT_CONTENT = ""
    # Go through the artist's name in alphabetical order
    for artist in sorted_artists:
        # Append the artist name with level 2 headings
        TEXT_CONTENT += f"⁕ {artist}\n"

        # Now for their albums:
        for album in sorted(ALL_ALBUMS_WITH_ARTISTS[artist]):
            # Add the album name with bullet points
            TEXT_CONTENT += f"\t • {album}\n"

        TEXT_CONTENT += "\n\n"

    # Now write the text file
    with open("Albums_in_MDRP.txt", "w") as file:
        file.write(TEXT_CONTENT)
        logger.info("Created the text file")
