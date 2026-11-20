from PIL import Image
import numpy as np
import json
paths = {
 'street': 'shots/continuation/exteriors/street_final.jpg',
 'city': 'shots/continuation/exteriors/city_final.jpg',
 'reference_street': 'C:/Users/Lenovo/AppData/Local/Temp/codex-clipboard-809a70c0-81cf-44b8-b3a2-4e3cee5574d5.png',
 'reference_city': 'C:/Users/Lenovo/AppData/Local/Temp/codex-clipboard-977a7869-97be-4966-b55d-49e4081ac72e.png',
}
result={}
for key,path in paths.items():
 im=Image.open(path)
 result[key]={'luminance_p10_p50_p90':np.percentile(np.asarray(im.convert('L')),[10,50,90]).tolist(),'mean_saturation':float(np.asarray(im.convert('HSV'))[:,:,1].mean()/255)}
print(json.dumps(result,indent=2))
with open('shots/continuation/exteriors/measurements.json','w') as f:json.dump(result,f,indent=2)
