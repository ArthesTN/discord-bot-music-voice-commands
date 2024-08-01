const ytstream = require('yt-stream');

(async () => {
    let stream;
    try {
        stream = await ytstream.stream(`https://www.youtube.com/watch?v=dQw4w9WgXcQ`, {
            quality: 'high',
            type: 'audio',
            highWaterMark: 1048576 * 32,
            download: true
        });
        stream.stream.pipe(fs.createWriteStream('some_song.mp3'));
        console.log(stream.video_url);
        console.log(stream.url);
    }
    catch(err){
        console.log(err)
    }
})();