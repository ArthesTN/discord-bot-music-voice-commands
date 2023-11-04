import speech_recognition as sr
import sys
import os
r = sr.Recognizer()

harvard = sr.AudioFile(sys.argv[1])
with harvard as source:
    try:
        audio = r.record(source)
        words = r.recognize_google(audio)
        with open(sys.argv[2], "w") as file:
    
            file.write(words)
            file.close()
    except sr.UnknownValueError:
            print("-")
    except sr.RequestError as e:
            print("failed".format(e))
    