# Malvorlage

Kostenlose, eigenständige Web-App in de-CH für kleine und grosse Bildschirme, besonders Galaxy S25 Ultra mit S Pen. Kein Konto, kein xAI-Abo, keine KI-API, kein npm-Laufzeitpaket. Keine Fotos verlassen die App. Hosting kann eigene Zugriffsdaten wie IP-Adressen protokollieren; die App enthält keine Analysewerkzeuge.

## Starten / testen

Voraussetzungen: Python 3 für einen lokalen Webserver, Node 20+ für Tests. Kein Installieren von Paketen nötig.

```sh
python3 -m http.server 8080
# http://localhost:8080 öffnen; nicht über file://
node --test tests/*.test.js
node --check app.js && node --check core.js && node --check worker.js && node --check sw.js
```

HTTPS oder localhost sind für PWA/Service Worker erforderlich. Für GitHub Pages die statischen Dateien im Hauptverzeichnis veröffentlichen (Branch main, root). `start_url`, Scope und alle Ressourcen sind relativ; vorgesehen ist `/malvorlage/`, andere Unterpfade funktionieren ebenfalls. Keine Build-Pipeline. `.nojekyll` verhindert unnötige Verarbeitung. In Chrome auf Android: Menü → «Zum Startbildschirm hinzufügen» / «Installieren». Erst nach «Offline bereit» ist der vollständige App-Cache verfügbar.

## Dateien / Architektur (auch für Gemini und ChatGPT)

- `index.html`, `style.css`: zugängliche, grosse Bedienelemente, drei kontextbezogene Ansichten, Druckansicht ohne UI.
- `app.js`: lokale Bilddekodierung, maximale Arbeitskante 1440 Pixel, Canvas-Ansichten, Pointer Events, Importbestätigung, PNG/Teilen/Drucken, IndexedDB. Das unveränderte Original-Blob bleibt lokal gespeichert; die Originalansicht zeigt die verkleinerte Arbeitskopie. Browser übernimmt EXIF-Orientierung. Transparenz wird weiss hinterlegt.
- `core.js`: reine, testbare Funktionen. Luminanz + fester 3×3-Gaussfilter + Sobel + Richtungs-Nichtmaximum-Unterdrückung. Detailregler senkt nur die Schwelle, erhöht also monoton die Linienmenge. Es ist ein Kantenfilter, **keine semantische KI-Vereinfachung**. Fotos mit ruhigem Hintergrund funktionieren besser. Bei gleichen starken Kanten können doppelte Linien stehen bleiben.
- `worker.js`: Bildfilter ausserhalb des Hauptthreads, Auftragsnummern verwerfen veraltete Antworten. Fallback im Hauptthread für Browser ohne Modul-Worker. 160-ms-Debounce. Der Fallback kann bei grossen Bildern kurz ruckeln.
- Zwei sichtbare Canvas-Ebenen: Basis und transparente Striche. Ein zusätzlicher Original- und Vorlagen-Canvas bleiben vom Radierer unberührt. Striche sind Vektoren in Arbeitsbildkoordinaten. Pointer-Koordinaten werden mit der aktuellen Bounding-Box skaliert, auch nach Scrollen/Grössenwechsel. Druck verstärkt die Strichdicke, sofern gemeldet. «Nur Stift» akzeptiert nur `pointerType=pen`, keine Garantie für geräteweite Handballenerkennung.
- `sw.js`: `malvorlage-v2`; HTML netzwerkzuerst, fester lokaler Asset-Cache. Bei Updates **Cache-Version erhöhen**, sonst können alte Skripte zusammen mit neuem HTML geladen werden. Keine automatischen Foto-Netzwerkaufrufe.
- `manifest.webmanifest`, `icons/`: selbst gezeichnete lokale PWA-Icons.
- `tests/`: Node-Tests mit synthetischen Daten, keine Fotos echter Personen und kein Browser-Ersatz.

## Daten / Grenzen

IndexedDB `malvorlage-local`, Store `projects`, Eintrag `current`: `{ version: 1, source: Blob, settings, history: { strokes, redo } }`. Nur das letzte Projekt, kein Cloud-Backup, keine Galerie. Einstellungen, Striche und Radierstriche werden 500 ms nach einer Änderung gespeichert; Erfolgsmeldung erst nach abgeschlossener Transaktion. Bei Hintergrundwechsel wird ein Speicherversuch gestartet; ein abruptes Beenden kann noch ungespeicherte letzte Striche verlieren. Quota-/Sperrfehler werden angezeigt; die Bearbeitung bleibt in der Sitzung möglich. Browser kann lokale Daten entfernen. PNG exportieren ist wichtig; es ist **keine bearbeitbare Projektsicherung**. Persistente App-Daten überleben nicht das Löschen von Website-Daten oder einen Wechsel von Gerät/Browser/Host.

Vor jedem Bildwechsel erscheint eine Bestätigung, selbst bei bereits gespeichertem Projekt. Abbrechen oder ungültiges neues Bild lässt das alte Projekt bestehen. Kein automatisches Überschreiben ohne Bestätigung. Grosse Bilder: Datei maximal 30 MB, dekodierte Auflösung maximal 80 Megapixel, Arbeitsbild maximal 1440 Pixel längste Kante. Browser muss Original vor der Auflösungsprüfung dekodieren; sehr grosse Dateien können auf schwachen Geräten trotzdem Speicher belasten. HEIC/RAW nur falls der Browser sie tatsächlich dekodiert; sonst verständliche Fehlermeldung. Keine externen Konverter.

Export in Ansicht «Original» und «Vorlage»: schwarze Vorlage auf Weiss. Export in «Nachzeichnen»: eigene Zeichnung mit eingestellter blasser Vorlage; für Striche ohne Hintergrund den Vorlagenregler auf 0 stellen. Druck exportiert **immer die klare Vorlage**, A4-Einpassung; endgültige Skalierung hängt vom Druckdialog ab. Teilen nutzt nur die native Web Share API auf ausdrücklichen Klick, andernfalls PNG. Neue Bilder werden niemals automatisch geteilt.

## Manuelle Abnahme vor Freigabe

1. Synthetisches Testbild auswählen, Original/Vorlage wechseln, Detailregler bewegen, transparente PNG prüfen.
2. Finger und echten S Pen testen, Druck/«Nur Stift», Handballen, schnelle Striche, Radierer, Zurück/Wieder, Scrollen und Drehen.
3. Zeichnung exportieren, drucken, neu laden → Projekt und Striche vorhanden. Neues Bild abbrechen und ungültige Datei testen → altes Projekt unverändert.
4. IndexedDB sperren/Quota simulieren → keine falsche Erfolgsmeldung. Browser offline schalten und vollständig neu laden.
5. Auf echtem Samsung Kamera, Fotoorientierung, Teilen, Download und Startbildschirm-Installation prüfen. Automatische Tests beweisen keine echte Kamera-/Stiftfunktion.

Keine garantierten dauerhaften Gratisbedingungen eines Hostinganbieters; die App selbst benötigt weder bezahlten Dienst noch ein KI-Abonnement und lässt sich als statische Dateien anderswo hosten.
