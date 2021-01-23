const chroma = require('chroma-js');

let new_data = 0;

function doSaturation(sat, pixel)
{
    return chroma.gl(pixel)
        .set('hsl.s', sat)
        ._rgb._unclipped;
}

async function processImage(img_data, saturation)
{
    new_data = img_data.map((pixel) => {
        let new_pixel = doSaturation(saturation, pixel);

        return [
            new_pixel[0]/255,
            new_pixel[1]/255,
            new_pixel[2]/255
        ];
    });

    return true;
}

module.exports = (self => {
    self.addEventListener('message', async function(ev) {
        await processImage(ev.data.image_data, ev.data.saturation);

        self.postMessage({
            img_data: new_data,
            time: ev.time,
        });
    });
});