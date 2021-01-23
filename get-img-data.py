from PIL import Image
import numpy as np
import json

class NumpyEncoder(json.JSONEncoder):
    def default(self, obj):
        if isinstance(obj, np.ndarray):
            return obj.tolist()
        return json.JSONEncoder.default(self, obj)

im = np.array(Image.open('assets/cms.png'))

f = lambda x: x / 255.0
vfunc = np.vectorize(f)

print(im.shape)
im_f = im.flatten().reshape(256 * 256, 3).astype(float)
im_f = vfunc(im_f)
print(im_f.shape)
im_s = json.dumps({'data': im_f}, cls=NumpyEncoder)

f = open('data.json', 'w')
f.write(im_s)
f.close()
