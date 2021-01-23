const regl = require('regl')();
const glsl = require('glslify');
const chroma = require('chroma-js');
const work = require('webworkify');
const { data } = require('./data.json');
const near = 0.01;
const far = 1000.0;
const camera = require('regl-camera')(regl, {
    distance: 4,
    phi: 0.5,
    theta: 0.5,
    center: [0, 0.0, 0],
    near, far,
});
const control = require('control-panel');

const crap = `
    vec3 mixRGB(vec3 color)
    {
        mat3 channels = mat3(rChan, gChan, bChan);

        return channels * color;
    }

    vec3 doSaturation(vec3 color, float sat)
    {
        if (sat < 1.0)
        {
            color.y = mix(0.0, color.y, sat);
            return color;
        }

        color.y = mix(color.y, color.y + 100.0, sat - 1.0);
        return color;
    }

    vec3 hsluv_intersectLineLine(vec3 line1x, vec3 line1y, vec3 line2x, vec3 line2y) {
        return (line1y - line2y) / (line2x - line1x);
    }
    
    vec3 hsluv_distanceFromPole(vec3 pointx,vec3 pointy) {
        return sqrt(pointx*pointx + pointy*pointy);
    }
    
    vec3 hsluv_lengthOfRayUntilIntersect(float theta, vec3 x, vec3 y) {
        vec3 len = y / (sin(theta) - x * cos(theta));
        if (len.r < 0.0) {len.r=1000.0;}
        if (len.g < 0.0) {len.g=1000.0;}
        if (len.b < 0.0) {len.b=1000.0;}
        return len;
    }
    
    float hsluv_maxSafeChromaForL(float L){
        mat3 m2 = mat3(
             3.2409699419045214  ,-0.96924363628087983 , 0.055630079696993609,
            -1.5373831775700935  , 1.8759675015077207  ,-0.20397695888897657 ,
            -0.49861076029300328 , 0.041555057407175613, 1.0569715142428786  
        );
        float sub0 = L + 16.0;
        float sub1 = sub0 * sub0 * sub0 * .000000641;
        float sub2 = sub1 > 0.0088564516790356308 ? sub1 : L / 903.2962962962963;
    
        vec3 top1   = (284517.0 * m2[0] - 94839.0  * m2[2]) * sub2;
        vec3 bottom = (632260.0 * m2[2] - 126452.0 * m2[1]) * sub2;
        vec3 top2   = (838422.0 * m2[2] + 769860.0 * m2[1] + 731718.0 * m2[0]) * L * sub2;
    
        vec3 bounds0x = top1 / bottom;
        vec3 bounds0y = top2 / bottom;
    
        vec3 bounds1x =              top1 / (bottom+126452.0);
        vec3 bounds1y = (top2-769860.0*L) / (bottom+126452.0);
    
        vec3 xs0 = hsluv_intersectLineLine(bounds0x, bounds0y, -1.0/bounds0x, vec3(0.0) );
        vec3 xs1 = hsluv_intersectLineLine(bounds1x, bounds1y, -1.0/bounds1x, vec3(0.0) );
    
        vec3 lengths0 = hsluv_distanceFromPole( xs0, bounds0y + xs0 * bounds0x );
        vec3 lengths1 = hsluv_distanceFromPole( xs1, bounds1y + xs1 * bounds1x );
    
        return  min(lengths0.r,
                min(lengths1.r,
                min(lengths0.g,
                min(lengths1.g,
                min(lengths0.b,
                    lengths1.b)))));
    }
    
    float hsluv_maxChromaForLH(float L, float H) {
    
        float hrad = radians(H);
    
        mat3 m2 = mat3(
             3.2409699419045214  ,-0.96924363628087983 , 0.055630079696993609,
            -1.5373831775700935  , 1.8759675015077207  ,-0.20397695888897657 ,
            -0.49861076029300328 , 0.041555057407175613, 1.0569715142428786  
        );
        float sub1 = pow(L + 16.0, 3.0) / 1560896.0;
        float sub2 = sub1 > 0.0088564516790356308 ? sub1 : L / 903.2962962962963;
    
        vec3 top1   = (284517.0 * m2[0] - 94839.0  * m2[2]) * sub2;
        vec3 bottom = (632260.0 * m2[2] - 126452.0 * m2[1]) * sub2;
        vec3 top2   = (838422.0 * m2[2] + 769860.0 * m2[1] + 731718.0 * m2[0]) * L * sub2;
    
        vec3 bound0x = top1 / bottom;
        vec3 bound0y = top2 / bottom;
    
        vec3 bound1x =              top1 / (bottom+126452.0);
        vec3 bound1y = (top2-769860.0*L) / (bottom+126452.0);
    
        vec3 lengths0 = hsluv_lengthOfRayUntilIntersect(hrad, bound0x, bound0y );
        vec3 lengths1 = hsluv_lengthOfRayUntilIntersect(hrad, bound1x, bound1y );
    
        return  min(lengths0.r,
                min(lengths1.r,
                min(lengths0.g,
                min(lengths1.g,
                min(lengths0.b,
                    lengths1.b)))));
    }
    
    float hsluv_fromLinear(float c) {
        return c <= 0.0031308 ? 12.92 * c : 1.055 * pow(c, 1.0 / 2.4) - 0.055;
    }
    vec3 hsluv_fromLinear(vec3 c) {
        return vec3( hsluv_fromLinear(c.r), hsluv_fromLinear(c.g), hsluv_fromLinear(c.b) );
    }
    
    float hsluv_toLinear(float c) {
        return c > 0.04045 ? pow((c + 0.055) / (1.0 + 0.055), 2.4) : c / 12.92;
    }
    
    vec3 hsluv_toLinear(vec3 c) {
        return vec3( hsluv_toLinear(c.r), hsluv_toLinear(c.g), hsluv_toLinear(c.b) );
    }
    
    float hsluv_yToL(float Y){
        return Y <= 0.0088564516790356308 ? Y * 903.2962962962963 : 116.0 * pow(Y, 1.0 / 3.0) - 16.0;
    }
    
    float hsluv_lToY(float L) {
        return L <= 8.0 ? L / 903.2962962962963 : pow((L + 16.0) / 116.0, 3.0);
    }
    
    vec3 xyzToRgb(vec3 tuple) {
        const mat3 m = mat3( 
            3.2409699419045214  ,-1.5373831775700935 ,-0.49861076029300328 ,
           -0.96924363628087983 , 1.8759675015077207 , 0.041555057407175613,
            0.055630079696993609,-0.20397695888897657, 1.0569715142428786  );
        
        return hsluv_fromLinear(tuple*m);
    }
    
    vec3 rgbToXyz(vec3 tuple) {
        const mat3 m = mat3(
            0.41239079926595948 , 0.35758433938387796, 0.18048078840183429 ,
            0.21263900587151036 , 0.71516867876775593, 0.072192315360733715,
            0.019330818715591851, 0.11919477979462599, 0.95053215224966058 
        );
        return hsluv_toLinear(tuple) * m;
    }
    
    vec3 xyzToLuv(vec3 tuple){
        float X = tuple.x;
        float Y = tuple.y;
        float Z = tuple.z;
    
        float L = hsluv_yToL(Y);
        
        float div = 1./dot(tuple,vec3(1,15,3)); 
    
        return vec3(
            1.,
            (52. * (X*div) - 2.57179),
            (117.* (Y*div) - 6.08816)
        ) * L;
    }
    
    
    vec3 luvToXyz(vec3 tuple) {
        float L = tuple.x;
    
        float U = tuple.y / (13.0 * L) + 0.19783000664283681;
        float V = tuple.z / (13.0 * L) + 0.468319994938791;
    
        float Y = hsluv_lToY(L);
        float X = 2.25 * U * Y / V;
        float Z = (3./V - 5.)*Y - (X/3.);
    
        return vec3(X, Y, Z);
    }
    
    vec3 luvToLch(vec3 tuple) {
        float L = tuple.x;
        float U = tuple.y;
        float V = tuple.z;
    
        float C = length(tuple.yz);
        float H = degrees(atan(V,U));
        if (H < 0.0) {
            H = 360.0 + H;
        }
        
        return vec3(L, C, H);
    }
    
    vec3 lchToLuv(vec3 tuple) {
        float hrad = radians(tuple.b);
        return vec3(
            tuple.r,
            cos(hrad) * tuple.g,
            sin(hrad) * tuple.g
        );
    }
    
    vec3 hsluvToLch(vec3 tuple) {
        tuple.g *= hsluv_maxChromaForLH(tuple.b, tuple.r) * .01;
        return tuple.bgr;
    }
    
    vec3 lchToHsluv(vec3 tuple) {
        tuple.g /= hsluv_maxChromaForLH(tuple.r, tuple.b) * .01;
        return tuple.bgr;
    }
    
    vec3 hpluvToLch(vec3 tuple) {
        tuple.g *= hsluv_maxSafeChromaForL(tuple.b) * .01;
        return tuple.bgr;
    }
    
    vec3 lchToHpluv(vec3 tuple) {
        tuple.g /= hsluv_maxSafeChromaForL(tuple.r) * .01;
        return tuple.bgr;
    }
    
    vec3 lchToRgb(vec3 tuple) {
        return xyzToRgb(luvToXyz(lchToLuv(tuple)));
    }
    
    vec3 rgbToLch(vec3 tuple) {
        return luvToLch(xyzToLuv(rgbToXyz(tuple)));
    }
    
    vec3 hsluvToRgb(vec3 tuple) {
        return lchToRgb(hsluvToLch(tuple));
    }
    
    vec3 rgbToHsluv(vec3 tuple) {
        return lchToHsluv(rgbToLch(tuple));
    }
    
    vec3 hpluvToRgb(vec3 tuple) {
        return lchToRgb(hpluvToLch(tuple));
    }
    
    vec3 rgbToHpluv(vec3 tuple) {
        return lchToHpluv(rgbToLch(tuple));
    }
    
    vec3 luvToRgb(vec3 tuple){
        return xyzToRgb(luvToXyz(tuple));
    } 
`;

const SATURATION = 'saturation';
let saturation = 1.0;

const R_CHANNEL = 'R_Channel';
let rChanUnf = [1, 0, 0];

const B_CHANNEL = 'B_Channel';
let bChanUnf = [0,0,1];

const G_CHANNEL = 'G_Channel';
let gChanUnf = [0,1,0];

const OFFSET = 'Offset';
let offset = [1,1,1];

const GAIN = 'Gain';
let gain = [1,1,1];

const SCALE = 'scale';
let scale = 1.0;

const controls = control([
    {
        type: 'range',
        label: SCALE,
        min: 0.0,
        max: 5.0,
        initial: scale,
        step: 0.1,
    },
    {
        type: 'range',
        label: SATURATION,
        min: 0.0,
        max: 3,
        initial: 1.0,
        step: 0.05,
    },
    {
        type: 'color',
        label: R_CHANNEL,
        format: 'array',
        initial: rChanUnf,
    },
    {
        type: 'color',
        label: G_CHANNEL,
        format: 'array',
        initial: gChanUnf,
    },
    {
        type: 'color',
        label: B_CHANNEL,
        format: 'array',
        initial: bChanUnf,
    },
    {
        type: 'color',
        label: OFFSET,
        format: 'array',
        initial: offset,
    },
    {
        type: 'color',
        label: GAIN,
        format: 'array',
        initial: gain,
    },
])

function hexToRgb(hex) {
  var res = hex.match(/[a-f0-9]{2}/gi);
  return res && res.length === 3
    ? res.map(function(v) { return parseInt(v, 16) / 255.})
    : null;
}

// control panel dirty
controls.on('input', (data) => {
    saturation = data[SATURATION]; 
    scale = data[SCALE];

    rChanUnf = !Array.isArray(data[R_CHANNEL]) ? hexToRgb(data[R_CHANNEL]) : data[R_CHANNEL];
    gChanUnf = !Array.isArray(data[G_CHANNEL]) ? hexToRgb(data[G_CHANNEL]) : data[G_CHANNEL];
    bChanUnf = !Array.isArray(data[B_CHANNEL]) ? hexToRgb(data[B_CHANNEL]) : data[B_CHANNEL];

    offset = !Array.isArray(data[OFFSET]) ? hexToRgb(data[OFFSET]) : data[OFFSET];
    gain = !Array.isArray(data[GAIN]) ? hexToRgb(data[GAIN]) : data[GAIN];
});

const NUM_POINTS = 256 * 256;
const VERT_SIZE = 4 * 3;

const pointBuffer = regl.buffer({
    data: Array(NUM_POINTS).fill().map((_, index) => {
        const color = [data[index][0], data[index][1], data[index][2]];
        return [
            // color
            color[0], color[1], color[2]
        ];
    }),
    usage: 'dynamic'
});

const drawParticles = regl({
    vert: `
precision mediump float;
attribute vec3 color;

uniform mat4 view, projection;
uniform float saturation, scale;
uniform vec3 rChan, gChan, bChan, offset, gain;

varying vec3 fragColor;

${crap}

void main()
{
    vec3 newColor = color;
    newColor *= offset;
    newColor = rgbToHsluv(newColor);
    newColor = doSaturation(newColor, saturation);
    newColor = hsluvToRgb(newColor);
    newColor = mixRGB(newColor);

    fragColor = newColor;
    vec3 position = newColor;
    vec4 pos = view * vec4(position * scale, 1.0);
    gl_Position = projection * pos;
    gl_PointSize = 5.0;
}
    `,
    frag: `
precision lowp float;

varying vec3 fragColor;

void main()
{
    // if (length(gl_PointCoord.xy - 0.5) > 0.5) discard;
    gl_FragColor = vec4(fragColor, 1.0);
}
`,
    attributes: {
        color: {
            buffer: pointBuffer,
            stride: VERT_SIZE,
            offset: 0,
        },
    },
    uniforms: {
        saturation: regl.prop('saturation'),
        rChan: regl.prop('rChan'),
        gChan: regl.prop('gChan'),
        bChan: regl.prop('bChan'),
        offset: regl.prop('offset'),
        gain: regl.prop('gain'),
        scale: regl.prop('scale'),
    },
    count: NUM_POINTS,
    primitive: 'points',
});

const drawImage = regl({
    vert: `
precision mediump float;
attribute vec2 position, uv;
varying vec2 vUV;
uniform vec2 aspectRatio;

void main()
{
    vUV = 0.0 + vec2(0.25, 1.0) * uv * aspectRatio;
    gl_Position = vec4(position, 0.0, 1.0);
}
    `,

    frag: `
precision mediump float;
uniform sampler2D texture;
uniform vec2 screenShape;
uniform float sat;
uniform vec3 rChan, gChan, bChan, offset;

varying vec2 vUV;

${crap}

void main()
{
    if (vUV.x < 0.0 || vUV.x > 1.0 ||
        vUV.y < 0.0 || vUV.y > 1.0)
    {
        discard;
    }
    vec3 color = texture2D(texture, vUV).rgb;

    color *= offset;

    vec3 color_lch = rgbToHsluv(color);
    color_lch = doSaturation(color_lch, sat);
    vec3 color_out = hsluvToRgb(color_lch);

    color_out = mixRGB(color_out);

    gl_FragColor = vec4(color_out, 1.0);
}
    `,
    attributes: {
        position: ctx => {
            return [
                -1, -1,
                -1, 0.35,
                -0.35, 0.35,
                -0.35, -1,
            ];
        },
        uv: [
            0, 1,
            0, 0,
            1, 0,
            1, 1,
        ],
    },
    uniforms: {
        texture: regl.prop('tex'),
        sat: regl.prop('saturation'),
        rChan: regl.prop('rChan'),
        gChan: regl.prop('gChan'),
        bChan: regl.prop('bChan'),
        offset: regl.prop('offset'),
        gain: regl.prop('gain'),
        aspectRatio: ctx => {
            const ar = ctx.viewportWidth / ctx.viewportHeight;
            return ar > 1 ? [ar, 1] : [1, 1 / ar];
        },
    },
    elements: [0, 3, 2, 0, 2, 1],
});

let lineWidth = 3;
if (lineWidth > regl.limits.lineWidthDims[1])
{
    lineWidth = regl.limits.lineWidthDims[1];
}
const drawBox = regl({
    vert: `
precision mediump float;

uniform mat4 projection, view;
uniform float scale;
attribute vec3 position;

void main() 
{
    gl_Position = projection * view * vec4(position * scale, 1.0);
}
    
    `,
    frag: `
precision mediump float;

void main()
{
    gl_FragColor = vec4(1.0, 1.0, 1.0, 1.0);
}
    `,
    attributes: {
        position: [
            [0, 1, 1], [1, 1, 1], [1, 0, 1], [0, 0, 1], // positive z face.
            [1, 1, 1], [1, 1, 0], [1, 0, 0], [1, 0, 1], // positive x face
            [1, 1, 0], [0, 1, 0], [0, 0, 0], [1, 0, 0], // negative z face
            [0, 1, 0], [0, 1, 1], [0, 0, 1], [0, 0, 0], // negative x face.
            [0, 1, 0], [1, 1, 0], [1, 1, 1], [0, 1, 1], // top face
            [0, 0, 0], [1, 0, 0], [1, 0, 1], [0, 0, 1]  // bottom face
        ]
    },
    uniforms: {
        scale: regl.prop('scale'),
    },
    elements: [
        [0, 1], [1, 2], [2, 3], [3, 0],
        [4, 5], [5, 6], [6, 7], [7, 4],
        [8, 9], [9, 10], [10, 11], [11, 8],
        [12, 13], [13, 14], [14, 15],
    ],
    lineWidth: lineWidth,
})

require('resl')({
    manifest: {
        image: {
            type: 'image',
            src: 'assets/footage.png',
        },
    },
    onDone: ({image}) => {
        const tex = regl.texture(image);
        regl.frame(() => {
            camera(() => {
                regl.clear({
                    color: [0.5, 0.5, 0.5, 1.0],
                    depth: 1,
                });

                drawParticles({
                    saturation: saturation,
                    rChan: rChanUnf,
                    gChan: gChanUnf,
                    bChan: bChanUnf,
                    offset,
                    gain,
                    scale,
                });
                drawBox({scale});
                drawImage({
                    tex,
                    saturation: saturation,
                    rChan: rChanUnf,
                    gChan: gChanUnf,
                    bChan: bChanUnf,
                    offset,
                    gain,
                });
            });
        });
    },
});