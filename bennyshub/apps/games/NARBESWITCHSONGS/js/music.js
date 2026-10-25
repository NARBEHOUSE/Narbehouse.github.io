/** Switch Songs catalog. */
window.NSS = window.NSS || {};
NSS.Music = (function () {
    const SONGS = NSS.SongLibrary.SONGS;
    return {
        SONGS, CATEGORIES: NSS.SongLibrary.CATEGORIES,
        song: id => SONGS.find(song => song.id === id)
    };
})();
