# Status

Senast uppdaterad 2026-11-16 (research med källor i `docs/KALLOR.md`, varning för mobil, nedtonad länk till AI-Folkbildaren).

## Klart

- **Steg 1, teknisk spik.** GPT-SW3 126M räknar i webbläsaren. Tokeniseraren är konverterad till `tokenizer.json` (identiska bitar som originalet i alla testmeningar) och modellen till ONNX (259 MB). Den krympta modellen ger samma toppval som originalet i PyTorch i 299 av 299 positioner. Testsidan finns kvar på `/spik.html`. Skripten och kommandona står i `scripts/README.md`.
- **Steg 2, förberäknad data** (`public/data/`). Galaxen: alla 64 000 bitars ordvektorer projicerade till 3D med UMAP, grannar uträknade i det riktiga rummet. Fil-exemplet: vinklar mellan vektorerna lager för lager, och attention. Reservexempel för steg 2 och 5–7.
- **Steg 3, partikelsystemet och scrollskelettet.** 64 000 partiklar, en per bit i modellens ordförråd, byter form: hjärna, moln, galax, tolv lager, solfjäder, ström och galax igen. Alla nio steg finns med reglage.
- **Steg 4, modellen inkopplad.** Egen mening, bitar, sannolikheter, slump och hallucination räknas live när modellen är laddad. Innan dess visas de förberäknade exemplen.
- **Ett första utkast till alla texter** och rutorna "Så här är det egentligen" (steg 5 i planen). De behöver läsas av Vidar och granskas.

- **Modellen ligger på Hugging Face:** [HuggingVidar/gpt-sw3-126m-onnx](https://huggingface.co/HuggingVidar/gpt-sw3-126m-onnx), med licens, riktlinjer och ett modellkort som beskriver ändringarna. Sidan hämtar modellen därifrån (se `src/model/config.js`), provkört i webbläsare 2026-11-14.

- **Felet "Något gick fel när sidan laddades" är rättat** (2026-11-15). Fem datafiler i `public/data/` (`galaxy.bin`, `words.bin`, `neighbors.bin`, `neighbors_sim.bin`, `examples_logits.bin`, sammanlagt 1,9 MB) hade aldrig kommit in i Git, eftersom `.gitignore` stängde ute alla `.bin`-filer. Vercel bygger från GitHub och fick därför inte med dem. Filerna är framräknade på nytt med `build_galaxy.py` och `precompute.py`. Kontroll: samma körning gav `vocab.json`, `examples.json` och `fil.json` byte för byte identiska med de som redan låg i Git. `.gitignore` har nu ett undantag för `public/data/*.bin`, och sidan säger i konsolen vilken fil som saknas om det händer igen. Galaxens form kommer från en ny UMAP-körning med samma slumpfrö, så den kan skilja sig lite från den som visades lokalt tidigare.

- **Sidan ligger på Vercel:** https://insidan-av-ai.vercel.app (projektet `insidan-av-ai`, kopplat till GitHub-repot). Första uppläggningen gjordes från arbetsgrenen och hamnade som produktionsversion, eftersom projektet saknade en sådan. Kontrollerat: den byggda sidan, datafilerna och sidhuvudena för flera processorkärnor levereras. Inte provat i en webbläsare från byggmiljön, eftersom den inte når vercel.app.

- **Ombyggd till en kameraåkning inåt** (2026-11-15), efter Vidars två invändningar: för lite häpnad, och känslan av att scrolla mellan olika sidor. Besluten står i `docs/PLAN.md` under "Ändrad riktning". Det som är gjort:
  - Inget innehåll scrollar längre. Varje scen är en sträcka att scrolla, och scrollen flyttar kameran (`updateProgress` i `src/main.js`, `view()` i `src/scene/stage.js`).
  - Resan: utanför hjärnan, in genom ytan, runt i rummet av bitar, från bit till bit längs din mening, till ett sökt ord, genom tolv lager som en tunnel, ut till solfjädern, igenom den in i strömmen, och ut igen.
  - Djup i bilden: punkter långt bort bleknar, punkter nära blir stora och mjuka, och de allra närmaste tonas bort.
  - Meningen skrivs i inledningen. Texten står som undertexter, reglagen i en list, och mitt i en övergång är bilden helt ren.
  - Siffror i bilden: likhetstal vid grannarna till ett sökt ord, och likheten mellan de tre trådarna för "fil" efter varje lager (uppmätta värden, inga mellanvärden).
  - Tangentbord: den som tabbar till ett reglage i en annan scen åker dit. Vid minskad rörelse byter bilden mellan fasta lägen utan åkning.
  - Provat i en webbläsare utan grafikkort i byggmiljön, i 1280 × 720 och i mobilbredd, utan fel i konsolen. Inte provat: riktig dator med grafikkort, modellen laddad, skärmläsare.

- **Kraschen på mobil är åtgärdad** (2026-11-15). Vidars iPhone (Chrome) visade "Det går inte att öppna den här sidan" varje gång, efter att modellen hade sparats. Orsaken var minnet. Uppmätt i Chromium på dator, bara modellen utan partiklar: **2,2 GB** som mest för en fil på 259 MB. Nedladdningen stod för cirka 600 MB av det och ONNX Runtime för resten. Den förberäknar alla vikter som 32-bitarstal (543 MB), gör en vänd kopia av ordtabellen (197 MB) och kopierar vikterna ur filen en gång till. Det här är gjort:
  - **På mobil och surfplatta startar modellen bara när man trycker på knappen**, även när den redan är sparad. Knappen säger då "Starta modellen (redan hämtad)".
  - **Ny modellfil på Hugging Face**, med samma vikter byte för byte: `onnx/model_split.onnx` (grafen) och `onnx/model_split.onnx_data` (vikterna). Vikterna ligger i en egen fil, och sista steget görs med Gemm i stället för en vänd kopia. Skriptet är `scripts/split_onnx.py`. Kontroll: samma logits som `model.onnx` (skillnad 0). Den gamla filen ligger kvar.
  - **Snålt läge på mobil**: vikterna görs om till 32 bitar först när de används. Logits skiljer högst 0,00003, och toppvalen är desamma. Priset är att varje ny bit tar ungefär dubbelt så lång tid. WebGPU provas inte i snålt läge.
  - **Nedladdningen** läses rakt in i en enda buffert. Första gången flödar filen till webbläsarens cache och läses sedan tillbaka, så filen finns bara en gång i minnet åt gången. Den gamla cachen (`inuti-sprakmodellen-v1`, 259 MB) tas bort.
  - **Om WebGPU misslyckas** släpps den halvfärdiga modellen innan WebAssembly provas.
  - **Om starten misslyckas** säger sidan lugnt att den visar färdiga exempel i stället. En telefon som får slut på minne stänger hela fliken utan att någon felhantering hinner köras. Därför lägger sidan en lapp i webbläsarens lagring före starten. Finns lappen kvar nästa gång, säger sidan att förra försöket inte blev klart och startar inte modellen av sig själv, inte heller på dator.
  - Uppmätt toppminne för hela sidan i Chromium: dator 1,8 GB (förut 2,2 GB plus sidan). Mobilläge (emulerad iPhone): 1,2 GB vid start från cachen och 1,4 GB vid första nedladdningen. Fart på dator i WebAssembly: 88 ms per ny bit i vanligt läge och 170–200 ms i snålt läge.
  - **Inte provat**: en riktig iPhone. Apple anger ingen fast minnesgräns för en flik i Safari eller Chrome på iPhone.

- **Tre nya scener är valda och provkörda** (2026-11-15). De är byggda, se nästa punkt. Vidar vill ha med skevhet (bias), efterträning med mänskliga betyg och inställsamhet (sycophancy). Han valde ett koncept per scen. De står i `docs/PLAN.md` under "Tillägg 2026-11-15". Idéerna till de två levande scenerna är provkörda mot modellen med `scripts/prova_skevhet.py`. Siffrorna är sannolikheten för nästa bit, i procent:
  - **Två solfjädrar (yrke och pronomen)**, efter "... berättade att": Undersköterskan hon 19,6 och han 3,0. Barnmorskan hon 18,9 och han 1,8. Förskolläraren hon 17,4 och han 4,6. Sjuksköterskan hon 13,8 och han 2,7. Lastbilschauffören han 37,0 och hon 3,5. Ingenjören han 27,8 och hon 4,6. Snickaren han 19,0 och hon 4,7. Mönstret är detsamma efter "... sa att". Läraren, Läkaren och Professorn ligger nästan jämnt. Bibliotekarien ger han 15,0 och hon 8,8.
  - **Den lutade solfjädern.** Frågan "– Vad tycker du om skoluniform?" följd av "– Jag tycker att skoluniform är en" ger "bra" 21,9. Om frågan i stället börjar med "Jag tycker att skoluniform är en jättebra idé" blir "jättebra" 92,8. Börjar den med "jättedålig idé" blir "jätted" (början på jättedålig) 63,5. Samma mönster för kärnkraft, elsparkcyklar, den nya bron och filmen (lutat svar mellan 50 och 95).
  - **Ett upplägg som inte fungerade:** "Fråga: ... Svar:" med Ja eller Nej. Skillnaderna var små och gick åt olika håll.
  - Efter "– Jag håller" är "med" den mest sannolika fortsättningen i alla tre versionerna (47 till 68), mot 4 till 12 för "inte".

- **De tre scenerna är byggda** (2026-11-15). Sidan har nu tolv scener, numrerade 0 till 11. De nya ligger efter slumpen: 7 Skevheten, 8 Efterträningen och 9 Medhållet. Hallucinationen är nummer 10 och slutscenen nummer 11.
  - **7 Skevheten:** två solfjädrar bredvid varandra för "X berättade att", med *hon* och *han* utmärkta. Fyra färdiga par, och ett eget ord till vänster när modellen är startad.
  - **8 Efterträningen:** solfjädern efter "– Kan du hjälpa mig att skriva ett brev?" är uträknad. När man scrollar faller tummar in, och bitarna Ja, Absolut, Självklart, Javisst och Gärna växer medan Nej, Varför, Inte och Aldrig krymper. Förändringen är påhittad (`RATE_UP`, `RATE_DOWN` och `RATE_STRENGTH` i `src/main.js`). Därför visas inga siffror i den scenen, och det står i bilden och i rutan.
  - **9 Medhållet:** vänster solfjäder är frågan utan åsikt, höger är samma fråga med åsikt. Ett reglage byter mellan "jättebra idé" och "jättedålig idé". Tre färdiga ämnen, och ett eget ämne när modellen är startad.
  - **Slutscenen** har fått en femte fråga: "Vad stod i min egen fråga?"
  - **Teknik:** den andra solfjädern ritas med egna punkter (`sidePoints` i `src/scene/stage.js`), eftersom de 64 000 partiklarna redan används av den första. Varje solfjäderscen har en egen form (`fan`, `bias`, `rate`, `lean`). De färdiga exemplen räknas fram med `scripts/precompute_extra.py`, som kör samma ONNX-fil som sidan. Filerna är `public/data/extra.json`, `extra_ids.bin` och `extra_probs.bin` (445 kB tillsammans). De innehåller de 4 096 mest sannolika bitarna per mening, vilket täcker minst 93 procent av sannolikheten. Resten fördelas jämnt på övriga bitar.
  - **Provat** i en webbläsare utan grafikkort, i 1280 × 720 och i mobilbredd, utan fel i konsolen. Med modellen startad lokalt (WebAssembly) gav ett eget ord (Brandmannen: han 36 procent, hon 3,0) och ett eget ämne (sommartid) resultat, och den levande uträkningen av "Sjuksköterskan berättade att" gav samma siffror som det färdiga exemplet.
  - **Inte provat:** riktig dator med grafikkort, skärmläsare, minskad rörelse i de nya scenerna.
  - **Känt fel i mobilbredd:** meningarna över de två solfjädrarna hamnar fel (den övre bakom sidhuvudet, den nedre över solfjädern).
  - **Lutningen utan upprepning är svag.** Med "Jag har alltid gillat X" eller "Jag är emot X" i frågan, och svaret "Jag tycker att X är", ändrades sannolikheterna bara några procentenheter. Scenen bygger därför på upprepning, och rutan säger det.

- **Helskärm, vridbar bild och röd tråd** (2026-11-15), efter tre önskemål från Vidar.
  - **Helskärm:** knappen "Helskärm" i överkanten, eller tangenten F. I helskärm tonas överkanten och stegprickarna ner tills man pekar på dem. Knappen döljs där webbläsaren saknar helskärm (iPhone). När fönstret byter höjd står besökaren kvar på samma ställe i resan (`anchor` i `src/main.js`).
  - **Vrida bilden:** dra med musen (vänster eller höger knapp), tryck ← och →, eller Skift + ↑ och ↓ för att luta. Dubbelklick eller knappen "Återställ vyn" ställer tillbaka. Som mest 90 grader åt sidan, så att lagren går att se rakt från sidan. Vridningen nollställs när man kommer till nästa scen. ↑ och ↓ utan Skift scrollar som förut, och piltangenterna vrider inte när man står i ett textfält eller reglage. Inne i rummet (scen 1) och i strömmen (scen 10) vrids blicken, i övriga scener går kameran runt det den tittar på (`initOrbit` och `frame` i `src/scene/stage.js`). Med fingret går det att dra i sidled.
  - **Röd tråd:** varje scen 2 till 10 börjar med en ny rad som knyter an till scenen före och säger vilken fråga scenen svarar på. Scen 1 slutar med en rad som beskriver hela vägen: bitar, tolv lager, sannolikhet för nästa bit. Scenerna är 0,6 till 1 skärmhöjd längre, så att varje rad får lika lång tid som förut (sidan är nu ungefär 49 skärmhöjder).
  - Rättat på köpet: vid minskad rörelse hoppades en rad över i scener med fem rader.
  - **Provat** i en webbläsare utan grafikkort, 1280 × 720, utan fel i konsolen: alla inledningsrader, vridning med tangent och mus, återställning, helskärm av och på, byte av fönsterhöjd. **Inte provat:** att dra med fingret på en riktig telefon, skärmläsare, riktig dator med grafikkort.

- **Länken till AI-Folkbildaren är nedtonad** (2026-11-16, Vidars önskemål). Den stora knappen "Till AI-Folkbildaren" är borta. I stället står en liten rad längst ner till höger i slutrutan: "Gillar du det här bygget? Besök gärna AI-Folkbildaren och titta på mer." "Börja om med en ny mening" står kvar som länk. Provat i 1280 × 720 och i mobilbredd.

- **Vidar har provat** (2026-11-16): inledningsraderna är bra, vridningen fungerar fint, sidan fungerar på hans iPhone, och han gillar de tre nya scenerna. Texterna behöver inte redigeras just nu.

- **Varning för mobil** (2026-11-16). På mobil och surfplatta visar första trycket på "Starta modellen" en ruta: "Den levande modellen fungerar bäst på en dator. På mobil och surfplatta behöver den mycket minne, räknar långsamt och startar ibland inte alls. Hela sidan fungerar ändå med färdiga exempel." Knappen byter till "Starta ändå", och andra trycket startar. Rutan läses upp av skärmläsare (`role="status"`). Provat i en emulerad iPhone 13. På dator ändras ingenting.

- **Research med källor** (2026-11-16), se `docs/KALLOR.md`. Artiklarna är lästa i fulltext. Resultat:
  - **Scen 8, efterträning:** gott stöd (Ouyang m.fl. 2022, InstructGPT), också för att de som skriver reglerna påverkar svaren. Men bedömarna *jämför* svar i stället för att sätta betyg, och ordet "dold" om instruktionen före samtalet är för starkt.
  - **Scen 9, inställsamhet:** gott stöd (Sharma m.fl. 2023, ICLR 2024; fem chattbotar från Anthropic, OpenAI och Meta). Men **"en säker ton i ett osäkert svar" har inget stöd** i studien och bör bytas, till exempel mot "ditt eget misstag upprepas".
  - **126M eller 136 miljoner:** "ungefär 136 miljoner" stämmer. Namnet följer troligen ramverkets standardstorlek med GPT-2:s ordförråd (126,0 miljoner med 51 200 bitar). Det är en gissning, se öppna frågor.
  - **Bitarna:** GPT-SW3 använder BPE via SentencePiece, tränad på 1 procent av träningstexten. Förenklingen på sidan stämmer.
  - **Attention:** gott stöd för att forskare är oeniga (Jain och Wallace 2019, Wiegreffe och Pinter 2019, Bibal m.fl. 2022, Abnar och Zuidema 2020). Att så mycket vikt hamnar på första biten har ett namn: *attention sink* (Xiao m.fl. 2023).
  - **Scen 7, skevhet:** i svensk text nämns bibliotekarier oftare med *han* än *hon* (23 procent *hon*), fast 76 procent av bibliotekarierna är kvinnor (Hansson m.fl. 2021, SweWinogender). Det kan förklara vår modells Bibliotekarien, men träningstexten är en annan. Att mönstret kan bli starkare eller svagare i modellen är belagt för andra modeller, inte direkt för en språkmodell mot sin egen text.

- **Textförslagen från researchen är införda** (2026-11-16): scen 1 (126M och 136 miljoner), scen 2 (siffror blir en bit per siffra), scen 4 (attention sink), scen 7 (bibliotekarier i svensk text), scen 8 (jämföra svar, ny mening om OpenAIs bedömare, "en instruktion som du inte ser") och scen 9 ("en del av förklaringen" och de tre formerna som studien faktiskt mätte). "En säker ton i ett osäkert svar" är borta. Rutan i scen 8 är nu så lång att den scrollar inuti. Provat i 1280 × 720 och emulerad iPhone, utan fel i konsolen.

## Nästa steg

0. **Vidar läser de ändrade rutorna** i scen 1, 2, 4, 7, 8 och 9 (se ovan).
1. **Texter (steg 5).** Utkasten gäller tills vidare. Vidar redigerar dem senare med Opus.
2. **Vidar provar den nya resan** och säger vad som känns rätt och fel: tempo, ljus, hur länge varje scen varar.
3. **Finputs (steg 6).** Mobilvyn är grovt gjord: listen med reglage tar stor plats. Prova också på en svag dator och med skärmläsare.
4. **Granskning (steg 7)** av en fristående session, särskilt påståendena under "Att kontrollera" nedan.
5. **Publicering (steg 8).** Sidan ligger redan uppe som förhandsversion. Kvar: lägg in arbetet i huvudgrenen `main` (Vercel bygger produktionsversionen därifrån), bestäm adress och länka från aifolkbildaren.se.

## Beslut

- **Fri text är på** (Vidar, 2026-11-14). Adressen `?visning` ger ett visningsläge med bara färdiga meningar. De förberäknade exemplen är filtrerade, live-text är det inte.

## Avvikelser från planen

- **Transformers.js används inte som helhet.** Sidan använder dess två byggstenar direkt: `@huggingface/tokenizers` och `onnxruntime-web`. Det gav full kontroll över sannolikheterna och slumpen och en mindre sida. GSAP behövdes inte, scrollen sköts med egen kod.
- **Steg 2 jämför två tokeniserare**, inte bara svenska mot engelska. Med GPT-SW3:s nordiska tokeniserare blir svenska inte fler bitar än engelska (6 mot 7 i exemplet). Poängen syns i stället när samma svenska mening klyvs av GPT-2:s engelska tokeniserare (13 bitar). Språkbytet finns kvar för de färdiga meningarna.
- **16-bitars lagring i stället för 8-bitars.** En vanlig 8-bitarsmodell (177 MB) gav samma toppval i bara 65 procent av positionerna och sköt sannolikheterna med upp till 9 procentenheter. Filen på 259 MB ger samma siffror som originalet.
- **Attention i steg 4 visas utan meningens första bit.** I den här modellen hamnar omkring 70 procent av vikten där. Det står i rutan.
- **Det förberäknade hallucinationsexemplet** handlar om ett påhittat Nobelpris i stället för en påhittad bok. Med boken skrev modellen ut namn på verkliga författare.
- **Ingen glödeffekt (bloom).** Den lade en grå dimma över bilden och kostar prestanda på svaga datorer. Djupet görs i stället i partiklarnas egen shader.
- **Strömmen i hallucinationsscenen** är ett rör av partiklar runt kameran, inte ett band bakom texten.

## Att kontrollera (granskningen)

- Modellen heter 126M, men filen innehåller 135 753 216 tal. Sidan säger "ungefär 136 miljoner". Stämmer det med hur AI Sweden räknar?
- "ChatGPT och andra chattbotar är mycket större" och "kan ofta söka på webben och hänvisa till källor" (steg 1 och 8). Rimligt, men inga siffror anges.
- Beskrivningen av hur bitarna tas fram (steg 2) är en förenkling av BPE.
- Påståendet att forskare är oeniga om vad attention-vikter förklarar (steg 4) saknar källa på sidan.
- "Stockholm får omkring 3 procent" (steg 5) är uträknat: 3,4 procent.

- Nya påståenden i texten: "Ordningen följer uträkningen: först bitarna, sedan lagren och sist sannolikheterna" (scen 1) och "Lagren är inga skivor i ett rum. Ett lager är ett steg i uträkningen" (scen 4).
- Slutraden "Någon hjärna fanns det inte, bara en uträkning" är en formulering att ta ställning till.
- Ny mening i scen 5 (2026-11-15): "Den mest sannolika nästa biten står i mitten och sticker ut längst. Ju längre åt sidorna, desto kortare, mörkare och mindre sannolik." Den ersätter "Ju ljusare och längre ut", som kunde läsas som längre ut åt sidorna. Stämmer med `buildFan` i `src/scene/shapes.js`.

- Nya rader 2026-11-15 (röd tråd). Påståenden att granska: "Platserna ställdes in när modellen tränades" (scen 3, stod förut bara i rutan), "det som modellen är tränad för: att räkna fram vad som kan komma härnäst" (scen 5), "En sak finns inte med i uträkningen: en kontroll av om texten är sann" (scen 10, gäller modellen på sidan; chattbotar med webbsökning nämns i slutscenens ruta).

- Nya påståenden i scen 7 till 9, skrivna utan att källor har lästs (Vidar: research görs i efterhand):
  - Scen 8: "I en vanlig metod får människor sätta betyg på svar. Sedan ställs modellens tal om." I rutan: att en hjälpmodell ofta tränas att förutsäga betygen (RLHF), att chattbotar tränas på exempelsamtal och att tjänster lägger en dold instruktion före samtalet.
  - Scen 9: "Efterträningen kan förstärka den, eftersom människor ofta ger högre betyg åt svar som håller med dem." I rutan: att inställsamhet kan visa sig som beröm, som ändrade svar när man säger emot och som säker ton, och att "forskare har mätt sådant hos flera stora chattbotar".
  - Scen 7: "Modellens tal har ställts in av träningstexten och inget annat, men mönstret kan vara både starkare och svagare i modellen än i texten."
  - Rubriken "Medhållet" och ordet "inställsamhet" som svensk term för sycophancy är mina val.

## Öppna frågor

- **Källorna till scenerna om efterträning och inställsamhet är lästa** (2026-11-16, `docs/KALLOR.md`). Formuleringarna är ändrade efter källorna.
- **Varför heter modellen 126M?** Gissning: namnet kommer från träningsramverkets standardstorlek, som räknar med GPT-2:s ordförråd. Varken artikeln eller modellkortet säger det. Modellkortet hos AI Sweden kräver ett godkännande, och kontot har inte det. Kan frågas direkt till AI Sweden.
- **Räcker upprepning som bild av inställsamhet?** Provat: utan ord att upprepa blir lutningen svag i den här modellen. Scenen visar därför upprepning och säger det i rutan. Frågan är om det är tillräckligt nära det besökaren möter i en chattbot.
- **Scenen om efterträning visar en påhittad förändring.** Det står tydligt, men det är sidans enda bild som inte är uträknad. Är det godtagbart?
- **Vilka yrken ska vara färdiga exempel i 7a?** Sjuksköterskan mot Ingenjören är tydligast. Bibliotekarien ger "han" oftare än "hon", och nu finns en möjlig förklaring med källa: i svensk text nämns bibliotekarier oftare med *han* (se `docs/KALLOR.md`, punkt 6).
- **Fri text i 7a och 7c** kan ge stötande resultat. Samma avvägning som för övrig fri text, och visningsläget `?visning` bör bara ha färdiga exempel.

- **Kan modellen alls köras på en iPhone?** Den fungerar på Vidars iPhone (2026-11-16). Andra telefoner med mindre minne är inte provade, därför varningen vid första trycket. Tidigare anteckning: Även i snålt läge behöver den drygt 1 GB, och det är inte provat på en riktig telefon. Vidar provar. Om det inte går finns tre förslag: (a) mobilen visar bara de färdiga exemplen, och knappen ersätts av en mening om att den levande modellen kräver en dator; (b) fler färdiga meningar, så att mobilen får mer att välja på; (c) en mindre modellfil för mobil, till exempel 8-bitarsvikter med MatMulNBits. Förslag c måste kontrolleras mot originalet, eftersom den 8-bitarsvariant som provades tidigare bara gav samma toppval i 65 procent av positionerna.
- **Cachen på iPhone.** Koden flödar filen direkt till webbläsarens cache. Om Safari på iPhone inte klarar det, hämtar koden filen en gång till utan cache, och då laddas 259 MB ner två gånger. Inte provat.

- **Vridning på mobil.** Att dra i sidled med fingret är byggt men inte provat på en riktig telefon. Upp och ner går inte att luta där, eftersom den rörelsen scrollar.
- **Ska vridningen ligga kvar mellan scenerna?** Nu nollställs den vid varje ny scen, så att nästa scen visas som den är tänkt.

- **Tempot i resan.** Hela sidan är ungefär 49 skärmhöjder att scrolla (41 före inledningsraderna, 30 före de tre nya scenerna). Längden per scen står som `--len` i `index.html` och är lätt att ändra.
- **Prestanda på svag dator.** Punkter nära kameran ritas stora, och det kostar mer än förut. Inte mätt på riktig hårdvara.

- **Nedladdningen på 259 MB.** På dator hämtas modellen automatiskt, på mobil och i datasparläge först när besökaren trycker på knappen (på mobil även när den redan är sparad). Är det rätt avvägning?
- **GPT-2:s tokeniserare** (1,4 MB, MIT-licens) ligger i `public/data/`. Vill vi ha jämförelsen?
- **AI Swedens licens** är läst. Vidaredistribution av ändrade versioner är tillåten om licensen och riktlinjerna följer med, upphovet anges (AI Sweden, RISE, WASP), ändringarna beskrivs och inget antyder att de står bakom versionen. Det är gjort i modellkortet och i sidfoten. Licensen kräver också att användare av en tjänst som bygger på modellen får veta det och kan nå villkoren: sidfoten länkar dit. En jurist har inte läst detta.
- Från planen, fortfarande öppna: licens för sidan, namn och adress, engelsk version.

## Bra att veta för nästa session

- Molnmiljön heter `insidan-av-ai` och har åtkomst till Hugging Face, arxiv.org och aclanthology.org (de två senare tillagda 2026-11-16 för att läsa artiklar). Hämta med `HF_HUB_DISABLE_XET=1`. En session kan starta i miljön Default, som inte når dem; byt då till `insidan-av-ai`.
- AI Swedens originalmodell (`AI-Sweden-Models/gpt-sw3-126m`) kräver ett godkännande som kontot inte har. Inställningarna finns i vår egen kopia, `HuggingVidar/gpt-sw3-126m-onnx`.
- Modellfilerna finns inte i Git. Sidan hämtar dem från Hugging Face. Miljön har en sparad skrivnyckel för `huggingface.co`, som proxyn sätter in automatiskt.
- Starta med `npm install` och `npm run dev`. `?ingenmodell` stänger av modellen, `?backend=wasm` tvingar WebAssembly och `?snal` ger mobilens snåla läge på dator.
- Sidan hämtar `onnx/model_split.onnx` och `onnx/model_split.onnx_data` (se `src/model/config.js`). Lokalt: lägg dem i `public/models/gpt-sw3-126m/onnx/` tillsammans med `tokenizer.json` och `tokenizer_config.json`, och starta med `VITE_MODEL_BASE=/models/gpt-sw3-126m/ npm run dev`.
- Minnet mäts enklast med Playwright: läs av processen `--type=renderer` med `ps` medan modellen startar. En tillfällig Playwright-profil har lite lagringsutrymme, så där sparas modellen aldrig i cachen. Använd `launchPersistentContext` för att prova cachen.
- WebGPU är inte provat (testmiljön har inget grafikkort). Koden väljer WebGPU när det finns och provkör en gång innan den litar på det.
