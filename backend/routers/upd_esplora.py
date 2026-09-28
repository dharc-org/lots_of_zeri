import re, os, pathlib
src = pathlib.Path(os.path.expanduser('~/mnt/lots_of_zeri/frontend/templates/esplora.html'))
outdir = pathlib.Path(os.path.expanduser('~/mnt/ClaudeOutputs/esplora_testi'))
outdir.mkdir(exist_ok=True)
h = src.read_text(encoding='utf-8')

C = '<em>corpus</em>'
def B(s): return f'<strong>{s}</strong>'
X0 = B("case d'asta")
X1 = B("restringere l'arco cronologico")
X2 = B("l'andamento delle vendite nel corso dell'anno solare")
X3 = B("quantità di case d'asta coinvolte")

standfirst = ("Tra XIX e XX secolo il mercato dell'arte internazionale attraversa una fase di forte espansione, "
 "con l'affermarsi di nuove case d'asta e il moltiplicarsi delle piazze di vendita e dei soggetti coinvolti. "
 f"La sezione <em>Esplora</em> evidenzia gli elementi chiave di questo scenario restituiti dai cataloghi: "
 f"dalle {X0} più attive ai {B('luoghi')} dell'incanto; dai {B('ritmi')} stagionali ai "
 f"{B('banditori')} che lo hanno animato; dalle {B('collezioni')} vendute alle tipologie più ricorrenti di "
 f"{B('oggetti')} offerti agli acquirenti.")

notes = {
'case': [
 f"Il grafico presenta tutte le case d'asta documentate nel {C} dei cataloghi digitalizzati, ordinate per numero di vendite organizzate. "
 f"Sulla {B('barra temporale')} sono visualizzate le aste a cui si riferiscono i cataloghi. "
 f"Ogni {B('cella')} colorata rappresenta un anno di attività documentata; il colore più o meno intenso indica la {B('frequenza di vendite')} in quell'anno, "
 "calcolata in modo relativo: il tono più scuro segna l'anno di maggiore attività di una specifica casa d'asta, e non è confrontabile tra organizzazioni diverse. "
 f"Cliccando su una cella si ottengono informazioni sul numero esatto di aste di quell'anno, mentre cliccando sul {B('numero di aste totali')} "
 "nella colonna a destra si viene rimandati alle vendite corrispondenti."],
'geografia': [
 "La visualizzazione evidenzia le città in cui furono organizzate più vendite all'asta tra quelle a cui si riferiscono i cataloghi. "
 "Per i quattro decenni documentati sono evidenziate le prime 10 piazze, in ordine di numero di vendite; quelle oltre la decima posizione sono "
 "richiamabili tramite il bottone «altre città» sotto il grafico. Nella colonna destra viene mostrato il numero di vendite complessivo svoltesi "
 "in quella città nel decennio corrispondente, cliccando sul quale si è rimandati all'elenco.",
 f"Coerentemente con la composizione del {C}, le prime posizioni sono in larga parte occupate dalle città tedesche, anche se la piazza in "
 "assoluto più attiva nell'arco cronologico risulta essere Parigi, con 527 aste."],
'trend': [
 f"La mappa permette di seguire l'andamento del mercato a partire dai {B('luoghi in cui si svolsero le aste')} nell'arco cronologico di riferimento. "
 f"Ogni cerchio indica una {B('città')}, con una dimensione che varia proporzionalmente al numero di eventi nel corso degli anni. "
 f"La curva nella timeline mostra invece il {B('numero di eventi per anno')} sommato su tutte le città, ed è utile per individuare a colpo d'occhio "
 "i periodi di maggiore o minore attività del mercato. Fermando l'autoplay con la freccia in alto a sinistra, e trascinando gli estremi della timeline, "
 f"è possibile {X1} indagato. In questa modalità, evidenziando i singoli cerchi si ottiene il numero di aste avvenute "
 "nelle città, anno per anno, e si può transitare ai cataloghi corrispondenti.",
 "È possibile navigare la mappa e variare l'inquadratura, inizialmente focalizzata sull'Europa centrale, per includere anche le aste organizzate oltreoceano."],
'stagionalita': [
 f"Il grafico sintetizza {X2}, nei sei paesi – Germania, Francia, Italia, Inghilterra, "
 "Paesi Bassi, Stati Uniti – in cui furono organizzate le vendite a cui i cataloghi si riferiscono. Passando con il mouse sul nome dei paesi si "
 "possono isolare le singole linee. Ogni punto nel grafico rappresenta la quota percentuale delle aste organizzate in un determinato mese rispetto "
 "al totale delle vendite avvenute in quel paese nel corso dell'anno. Passando il mouse su un punto appare il numero esatto di aste nel mese e "
 "la percentuale corrispondente sul totale."],
'banditori2': [
 "Il grafico è dedicato ai banditori, figure chiave che conducono le vendite e spesso intervengono nella loro organizzazione. "
 f"Nel {C} sono documentati nel 30% delle aste, con una forte concentrazione per le vendite parigine.",
 f"A sinistra è visualizzato un {B('elenco di tutti i banditori')} menzionati dai cataloghi, ordinati per numero di aste associate. "
 "Il grafico sulla destra permette di visualizzare le relazioni tra questi professionisti e le diverse case di vendita con cui collaborano. "
 "Lo spessore di ogni linea è proporzionale al numero di aste condotte da quel banditore presso quella specifica casa. "
 "I banditori che lavorano in proprio, organizzando direttamente le aste, non compaiono nei nodi del grafico ma sono visibili solo in elenco."],
'collezioni': [
 "Il grafico è dedicato alle collezioni di oggetti d'arte che furono vendute nel corso di più aste. La visualizzazione evidenzia il numero di "
 f"vendite, gli anni in cui avvennero e la {X3}. Cliccando su una collezione è possibile consultare i "
 "dati di dettaglio e richiamare tutte le aste corrispondenti.",
 "Nel caso tutti gli eventi cadono nello stesso anno, è probabile si tratti di un'unica vendita effettuata in più sessioni. Se si estendono "
 "su più anni sono gestiti dalla stessa casa d'asta, è verosimile che si tratti di una liquidazione a <em>tranche</em> con un solo operatore. "
 "Quando per una stessa collezione cambiano sia gli anni che le case d'asta si ha una rappresentazione più tangibile della sua dispersione sul mercato."],
'tipologie': [
 f"Il grafico visualizza le tipologie di oggetti venduti nelle aste documentate dal {C}, anno per anno. I dati sono estratti dalle "
 "informazioni registrate sui frontespizi e si riferiscono in massima parte ad aste 'tematiche', dedicate a tipologie chiaramente "
 "individuabili. Cliccando sui pulsanti in alto è possibile filtrare il grafico in base alle sei categorie più ricorrenti — Dipinti, Mobili, "
 "Disegni, Acquerelli, Porcellane, Stampe — per visionare il numero degli eventi associati. Cliccando su «altre» si apre la lista completa "
 "delle tipologie che permette di apprezzare la varietà dei manufatti offerti alla vendita e immessi sul mercato."],
}

h, n = re.subn(r'(<p class="expl-standfirst">\s*).*?(\s*</p>)', lambda m: m.group(1) + standfirst + m.group(2), h, count=1, flags=re.S)
assert n == 1
for pid, paras in notes.items():
    pat = re.compile(r'(<div class="expl-panel[^"]*" id="panel-' + pid + r'"[^>]*>\s*<p class="expl-metanote-label">[^<]*</p>\s*)<p class="expl-metanote">.*?</p>', re.S)
    new = '\n      '.join(f'<p class="expl-metanote">{p}</p>' for p in paras)
    h, n = pat.subn(lambda m: m.group(1) + new, h, count=1)
    assert n == 1, pid
(outdir / 'esplora.html').write_text(h, encoding='utf-8')
print('ok')
