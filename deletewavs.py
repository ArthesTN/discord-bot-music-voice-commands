import os
#delete all recordings
currentdir = os.getcwd()
print(currentdir)
speechpath = os.path.join(currentdir, "speechaudios")
for item in os.listdir(speechpath):
    if not item.endswith('placeholder'):
        os.remove(os.path.join(speechpath, item))