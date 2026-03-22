import whisper
import os
import sys

def transcribe(file_path):
    print(f"Chargement du modèle Whisper...")
    model = whisper.load_model("base")
    print(f"Transcription en cours pour {file_path}...")
    result = model.transcribe(file_path, language="fr")
    
    output_file = "transcription_audio.txt"
    with open(output_file, "w", encoding="utf-8") as f:
        f.write(result["text"])
    
    print(f"Terminé ! Transcription sauvegardée dans {output_file}")

if __name__ == "__main__":
    audio_path = r"D:\WhatsApp CRM\fleury13.mp3"
    if not os.path.exists(audio_path):
        print(f"Erreur: Fichier non trouvé à {audio_path}")
        sys.exit(1)
    transcribe(audio_path)
