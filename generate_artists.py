import logging
import os
import pprint
from os.path import join, isfile
from typing import Tuple, Dict, TypeVar


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
        artist = splitted[-1].strip("\n")

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
        if not letter.isalnum() and letter != " ":
            logger.debug("escaping: %s \t %s", letter, string)
            escaped_string += rf"\{letter}"
        else:
            escaped_string += letter
    return escaped_string


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
                album, artist = get_album_and_artist(album_entry)
                # Check if the album's entry for artist exists or not to avoid double entry
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
