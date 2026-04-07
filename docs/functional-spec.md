# Specifiche Funzionali — CFS Reporting & Writeback

> Versione: 0.1 — Draft
> Data: 2026-03-26
> Stato: In definizione
> Fonte dati di riferimento: model.bim (MESAFINANCEDEMO)

---

## 1. Obiettivo del sistema

Il sistema è un'applicazione web che consente di:

1. **Consultare** dati di consolidamento finanziario (CFS) organizzati per entità giuridiche, periodi, scenari, conti riclassificati, centri di costo e altre dimensioni di analisi.
2. **Navigare** i dati attraverso gerarchie espandibili/comprimibili, filtri dimensionali e assi configurabili (righe, colonne, filtri di pagina).
3. **Modificare** singoli valori nelle griglie di reportistica, sia a livello di dettaglio (foglia) sia a livello di aggregato (subtotale), salvando le modifiche come delta rispetto al dato di base.
4. **Tracciare** ogni modifica con audit completo (chi, quando, cosa, perché).

Il sistema **non modifica** i dati di base del consolidamento. Ogni intervento dell'utente è registrato come rettifica separata (delta) e viene sovrapposto al dato originale in fase di visualizzazione.

---

## 2. Concetti di dominio

### 2.1 Dimensioni di analisi

Il sistema espone le seguenti dimensioni di analisi, derivate dalla struttura del modello CFS esistente.

| Dimensione | Descrizione | Struttura |
|---|---|---|
| **Riclassificazione** | Classificazione dei conti nel bilancio consolidato (voci di P&L, Stato Patrimoniale, Cash Flow). È l'asse principale dei report. | Gerarchia padre-figlio fino a 5 livelli, ragged (non tutti i rami arrivano al livello 5). |
| **Processo** | Identifica un periodo temporale + uno scenario (Actual, Budget, Forecast, ecc.). Ogni processo corrisponde a un caricamento dati nel sistema CFS. | Gerarchia: Anno → Mese. Ogni processo ha un riferimento al processo precedente per confronti periodo-su-periodo. |
| **Entità** | Società giuridica del gruppo. | Lista piatta. Ogni entità ha codice e descrizione. |
| **Livello di rettifica** | Classificazione del tipo di rettifica contabile (es. dato originale, eliminazione IC, rettifica di conversione, ecc.). | Gerarchia a 3 livelli: Gruppo Rettifica → Tipo Gruppo → Livello Rettifica. |
| **Perimetro (Scope)** | Perimetro di consolidamento (es. IFRS, principi locali). Determina quali livelli di rettifica sono visibili. | Lista piatta, collegata ai livelli di rettifica con relazione molti-a-molti. |
| **Centro di costo** | Dimensione analitica di dettaglio. | Lista piatta con raggruppamento e responsabile. |
| **CO (Oggetto di controlling)** | Seconda dimensione analitica di dettaglio. | Lista piatta con codice e descrizione. |
| **Valuta** | Valuta degli importi. | Lista piatta con codice e descrizione. |
| **Controparte** | Entità controparte per operazioni intercompany. | Lista piatta (stesse entità del gruppo, in ruolo diverso). |
| **Conto locale → Conto di gruppo** | Mappatura dal piano dei conti locale (per entità) al piano dei conti di gruppo. | Catena: Conto locale → Conto di gruppo → Gruppo di consolidamento. |

### 2.2 Misure

Il sistema espone le seguenti grandezze calcolate:

| Misura | Descrizione | Logica |
|---|---|---|
| **Importo (valuta locale)** | Valore in valuta locale dell'entità, con segno corretto (P&L invertito). | Somma dei valori base + eventuali delta di writeback. Le voci di P&L sono presentate con segno invertito (ricavi positivi, costi negativi). |
| **Importo (valuta documento)** | Valore nella valuta del documento originale, con segno corretto. | Stessa logica di segno. |
| **Tasso di cambio medio** | Media del tasso di cambio locale. | Media aritmetica. |
| **Variazione vs processo precedente** | Differenza tra il valore del periodo corrente e quello del periodo precedente (dello stesso scenario). | Importo corrente − Importo del processo collegato come "precedente". |

### 2.3 Inversione di segno

Le voci di Conto Economico (P&L) hanno segno invertito rispetto alla registrazione contabile: i ricavi sono mostrati come positivi, i costi come negativi. Questa logica è determinata dal nodo radice della gerarchia di riclassificazione a cui la voce appartiene. Il sistema deve applicarla automaticamente in ogni report.

---

## 3. Report

### 3.1 Struttura di un report

Ogni report è definito dalla combinazione di:

| Elemento | Funzione |
|---|---|
| **Asse righe** | Una o più dimensioni con gerarchia espandibile/comprimibile. Di norma: Riclassificazione. |
| **Asse colonne** | Una o più dimensioni i cui membri diventano colonne. Di norma: Processo (periodi/scenari affiancati). |
| **Filtri di pagina** | Dimensioni il cui membro selezionato filtra l'intero report. Di norma: Entità, Perimetro, Valuta. |
| **Misure** | Una o più misure visualizzate nelle celle della griglia. |

### 3.2 Comportamento della griglia

- Le righe della gerarchia di riclassificazione sono **espandibili e comprimibili**. L'utente può navigare dal livello più aggregato (es. "Conto Economico") fino alla foglia (singola voce contabile).
- Le righe di subtotale mostrano la **somma dei figli visibili** più eventuali rettifiche manuali di livello aggregato (vedi sezione 4.2).
- Le righe vuote in gerarchie ragged (dove un ramo non arriva al livello massimo) sono **soppresse**: non vengono mostrate righe con livello vuoto.
- Le colonne corrispondono ai membri della dimensione sull'asse colonne (es. ogni colonna = un mese, oppure ogni colonna = uno scenario).
- La colonna della gerarchia è **bloccata a sinistra** durante lo scroll orizzontale.
- I valori negativi sono evidenziati visivamente (es. colore diverso).

### 3.3 Report predefinito (MVP)

Il report predefinito è un **Conto Economico (P&L)**:

- **Righe:** Gerarchia di Riclassificazione (tutti i livelli espandibili).
- **Colonne:** Processi selezionati (es. Actual Gen-2025, Actual Feb-2025, Budget 2025).
- **Filtri:** Entità, Perimetro, Valuta.
- **Misura:** Importo (valuta locale).

### 3.4 Definizione di report personalizzati (post-MVP)

Dopo l'MVP, l'utente autorizzato potrà definire nuovi report scegliendo:
- quale dimensione posizionare sulle righe,
- quale sulle colonne,
- quali filtri di pagina,
- quali misure visualizzare.

---

## 4. Writeback (modifiche ai dati)

### 4.1 Principio generale

L'utente può **modificare il valore di una cella** nella griglia. Il sistema:

1. **Non sovrascrive** il dato di base proveniente dal consolidamento.
2. **Registra la differenza** (delta) tra il valore visualizzato e il nuovo valore inserito dall'utente.
3. **Sovrappone** il delta al dato di base in tutte le successive visualizzazioni.
4. **Registra** chi ha effettuato la modifica, quando, e con quale motivazione.

### 4.2 Livelli di writeback

Il sistema supporta due livelli di modifica:

#### 4.2.1 Writeback a livello foglia

L'utente modifica una cella che corrisponde a una **voce di dettaglio** della gerarchia di riclassificazione (nodo foglia, senza figli).

- La modifica è puntuale: riguarda esattamente una voce contabile, per un'entità, un periodo, un livello di rettifica.
- Il delta si applica direttamente al dato di base di quella voce.
- I subtotali dei livelli superiori si aggiornano automaticamente.

**Esempio:** L'utente modifica "Ricavi da vendite Italia" per l'entità ALFA, periodo Gen-2025, da 1.500 a 1.700. Il sistema registra un delta di +200. Il subtotale "Ricavi totali" e poi "EBITDA" si aggiornano automaticamente.

#### 4.2.2 Writeback a livello aggregato (rettifica manuale)

L'utente modifica una cella che corrisponde a un **nodo padre** (subtotale) della gerarchia di riclassificazione. Questo nodo non ha un dato di base proprio — il suo valore è la somma dei figli.

In questo caso il sistema:

1. **Crea una voce di rettifica manuale** sotto il nodo padre. Questa voce è un "figlio sintetico" del nodo padre, visibile nella gerarchia quando il nodo è espanso.
2. **Il delta viene assegnato alla voce sintetica**, non distribuito ai figli naturali.
3. **Il subtotale del nodo padre** diventa: somma dei figli naturali + somma dei figli sintetici (rettifiche manuali).
4. La voce sintetica è **chiaramente distinguibile** nella griglia (etichetta diversa, es. "Rettifica manuale — EBITDA", evidenziazione visiva).
5. La voce sintetica è **editabile**: l'utente può modificarla ulteriormente o azzerarla.
6. La voce sintetica ha un **livello di rettifica dedicato** ("Writeback manuale"), che consente di includerla o escluderla dai report tramite il filtro Livello di Rettifica o Perimetro.

**Esempio:** L'utente modifica il subtotale "EBITDA" per l'entità ALFA, periodo Gen-2025, aggiungendo +200. Il sistema crea (o aggiorna) la voce "Rettifica manuale — EBITDA" come figlia di EBITDA, con valore +200. Il totale EBITDA diventa: somma naturale dei figli + 200.

#### 4.2.3 Cosa NON fa il writeback aggregato

- **Non distribuisce** il valore inserito ai figli naturali del nodo. La rettifica resta concentrata nella voce sintetica.
- **Non sostituisce** il subtotale calcolato. Il subtotale continua a essere la somma dei figli (naturali + sintetici).
- **Non modifica** i dati di base di nessun figlio naturale.

#### 4.2.4 Visibilità delle rettifiche manuali

| Situazione | Cosa vede l'utente |
|---|---|
| Nodo padre compresso | Il subtotale include la rettifica manuale nel totale. |
| Nodo padre espanso | I figli naturali sono visibili con i loro valori. In fondo appare la voce "Rettifica manuale — [nome nodo]" con il valore del delta. |
| Filtro "Livello rettifica" = solo writeback manuale | Il report mostra solo le rettifiche manuali inserite dagli utenti, senza i dati di base. |
| Filtro "Livello rettifica" = escludi writeback manuale | Il report mostra i dati di base puri, come se nessuna rettifica manuale fosse stata inserita. |

### 4.3 Vincoli di writeback

| Vincolo | Comportamento |
|---|---|
| **Processo chiuso** | Se un processo è stato chiuso (bloccato), nessuna modifica è permessa per quel periodo/scenario. Il sistema rifiuta il salvataggio e informa l'utente. |
| **Permessi per entità** | L'utente può modificare solo le entità per cui ha il permesso di scrittura. Le celle relative ad altre entità sono in sola lettura. |
| **Annotazione obbligatoria per rettifiche aggregate** | Quando l'utente inserisce una rettifica a livello aggregato, il sistema richiede una nota motivazionale (campo testo). Per rettifiche a livello foglia, l'annotazione è facoltativa. |
| **Conflitto di modifica concorrente** | Se due utenti modificano la stessa cella contemporaneamente, il secondo utente riceve un avviso di conflitto e deve confermare o annullare la propria modifica, vedendo il valore aggiornato dall'altro utente. |

### 4.4 Annullamento di una modifica

L'utente può **annullare una rettifica** precedentemente inserita:

- Per le rettifiche a livello foglia: seleziona la cella e sceglie "Ripristina valore base". Il delta viene disattivato.
- Per le rettifiche aggregate: seleziona la voce sintetica e la azzera o la elimina. La voce sintetica può restare visibile con valore zero oppure essere nascosta.

L'annullamento è anch'esso tracciato nell'audit.

---

## 5. Navigazione dimensionale

### 5.1 Pannello filtri

Il report presenta un **pannello filtri** con i seguenti selettori:

| Filtro | Tipo di selezione | Obbligatorio |
|---|---|---|
| Entità | Selezione singola o multipla | Sì |
| Perimetro (Scope) | Selezione singola | Sì |
| Valuta | Selezione singola | Sì |
| Processo / Periodo | Selezione multipla (i selezionati diventano colonne) | Sì (almeno uno) |
| Livello di rettifica | Selezione multipla (filtro inclusivo) | No (default: tutti) |
| Centro di costo | Selezione singola o multipla | No (default: tutti) |
| CO | Selezione singola o multipla | No (default: tutti) |
| Controparte | Selezione singola o multipla | No (default: tutti) |

Quando il Perimetro cambia, la lista dei livelli di rettifica disponibili si aggiorna automaticamente (solo quelli associati al perimetro selezionato).

### 5.2 Espansione gerarchica

Nelle dimensioni gerarchiche (Riclassificazione, Livello di rettifica, Processo/calendario):

- L'utente può **espandere** un nodo per vederne i figli.
- L'utente può **comprimere** un nodo per tornare al subtotale.
- L'utente può **espandere tutto** o **comprimere tutto** con un'azione globale.
- Lo stato di espansione è mantenuto durante la sessione. Se l'utente cambia un filtro, la griglia si aggiorna mantenendo lo stato di espansione dove possibile.

---

## 6. Audit e tracciabilità

### 6.1 Registro delle modifiche

Ogni modifica (writeback) genera una voce nel registro di audit con le seguenti informazioni:

| Campo | Descrizione |
|---|---|
| Utente | Chi ha effettuato la modifica. |
| Data e ora | Timestamp preciso della modifica. |
| Coordinate della cella | Entità, periodo, conto (naturale o sintetico), livello di rettifica, centro di costo, valuta. |
| Misura modificata | Quale grandezza è stata modificata (es. Importo valuta locale). |
| Valore precedente | Il valore effettivo visualizzato prima della modifica (base + delta precedenti). |
| Nuovo valore | Il valore dopo la modifica. |
| Delta | La differenza registrata. |
| Tipo di modifica | Foglia / Rettifica aggregata / Annullamento. |
| Annotazione | Nota dell'utente (obbligatoria per rettifiche aggregate, facoltativa per foglia). |

### 6.2 Consultazione audit

L'utente autorizzato può consultare il registro audit:

- **Per cella:** selezionando una cella nella griglia e richiedendo la cronologia delle modifiche.
- **Per report:** visualizzando tutte le modifiche attive relative al report corrente (con i filtri correnti).
- **Globale:** visualizzando tutte le modifiche in un periodo, per utente, per entità (funzionalità di amministrazione).

---

## 7. Gestione dei processi

### 7.1 Stato del processo

Ogni processo (periodo + scenario) ha uno stato:

| Stato | Significato | Writeback permesso |
|---|---|---|
| **Aperto** | Periodo attivo, modifiche permesse. | Sì |
| **Chiuso** | Periodo consolidato e approvato. | No |

### 7.2 Chiusura e riapertura

- Un utente con ruolo **Approvatore** può chiudere un processo. Alla chiusura, tutte le rettifiche esistenti vengono "congelate" e non è più possibile inserirne di nuove.
- Un utente con ruolo **Amministratore** può riaprire un processo chiuso. La riapertura viene registrata nell'audit.

### 7.3 Ricaricamento dati di base

Se i dati di base CFS vengono ricaricati per un processo che ha rettifiche writeback:

- Le rettifiche esistenti **non vengono cancellate automaticamente**.
- Il sistema segnala all'utente che i dati di base sono cambiati e che le rettifiche potrebbero non essere più coerenti.
- L'utente può decidere di mantenere, modificare o annullare le rettifiche esistenti.

---

## 8. Profili utente e permessi

### 8.1 Ruoli

| Ruolo | Può consultare | Può modificare | Può chiudere processi | Può gestire utenti |
|---|---|---|---|---|
| **Visualizzatore** | Sì (entità autorizzate) | No | No | No |
| **Editore** | Sì (entità autorizzate) | Sì (entità autorizzate) | No | No |
| **Approvatore** | Sì (tutte) | Sì (entità autorizzate) | Sì | No |
| **Amministratore** | Sì (tutte) | Sì (tutte) | Sì | Sì |

### 8.2 Permessi per entità

Ogni utente ha una lista di entità per cui è autorizzato. Il sistema:

- Mostra solo i dati delle entità autorizzate (o tutte, per Approvatore/Admin).
- Permette il writeback solo sulle entità per cui l'utente ha permesso di scrittura.
- Non espone l'esistenza di entità non autorizzate (l'utente non le vede nei selettori).

---

## 9. Requisiti funzionali di dettaglio (riepilogo)

| ID | Requisito | Priorità |
|----|-----------|----------|
| F01 | Visualizzare un report con gerarchia di riclassificazione su righe e processi su colonne | MVP |
| F02 | Espandere e comprimere i nodi della gerarchia | MVP |
| F03 | Filtrare per entità, perimetro, valuta | MVP |
| F04 | Selezionare i processi da visualizzare come colonne | MVP |
| F05 | Modificare una cella a livello foglia e salvare il delta | MVP |
| F06 | Modificare una cella a livello aggregato tramite voce sintetica e salvare il delta | MVP |
| F07 | Visualizzare le voci sintetiche come figli distinguibili nella gerarchia espansa | MVP |
| F08 | Applicare la logica di inversione di segno automaticamente | MVP |
| F09 | Sopprimere le righe vuote nelle gerarchie ragged | MVP |
| F10 | Richiedere annotazione obbligatoria per rettifiche aggregate | MVP |
| F11 | Gestire conflitti di modifica concorrente | MVP |
| F12 | Registrare ogni modifica nel registro audit | MVP |
| F13 | Consultare la cronologia modifiche per cella | MVP |
| F14 | Gestire permessi utente per entità | MVP |
| F15 | Bloccare il writeback su processi chiusi | MVP |
| F16 | Filtrare per livello di rettifica (includi/escludi writeback manuale) | MVP |
| F17 | Filtrare per centro di costo, CO, controparte | MVP |
| F18 | Definire report personalizzati (scelta assi, misure, filtri) | Post-MVP |
| F19 | Visualizzare più misure nello stesso report | Post-MVP |
| F20 | Esportare il report in Excel | Post-MVP |
| F21 | Calcolare la variazione vs processo precedente | Post-MVP |
| F22 | Workflow di approvazione con chiusura/riapertura processo | Post-MVP |
| F23 | Consultazione audit globale (per periodo, utente, entità) | Post-MVP |
| F24 | Segnalazione automatica post-ricaricamento dati base | Post-MVP |
| F25 | Distribuzione (allocazione) di rettifica aggregata ai figli naturali | Post-MVP |

---

## 10. Elementi esclusi dallo scope

Per chiarezza, i seguenti elementi **non** fanno parte del sistema proposto:

- Calcolo del consolidamento (eliminazioni IC, conversione valutaria, rettifiche di consolidamento). Questi restano nel sistema CFS esistente.
- Caricamento dei dati di base. Il sistema legge i dati prodotti dal CFS.
- Gestione anagrafica delle dimensioni (creazione nuove entità, modifica del piano dei conti, ecc.). Le anagrafiche sono gestite nel sistema CFS.
- Funzionalità di data entry massivo (import da file). L'inserimento avviene cella per cella nella griglia.
- Reportistica esterna (invio report via email, schedulazione, ecc.).

---

## 11. Glossario

| Termine | Definizione |
|---|---|
| **CFS** | Consolidated Financial Statements — il sistema di consolidamento finanziario che produce i dati di base. |
| **Delta** | La differenza tra il valore originale e il valore modificato dall'utente. Il sistema salva solo il delta, non il valore assoluto. |
| **Voce sintetica** | Un elemento creato dal sistema per ospitare una rettifica manuale a livello aggregato. Non esiste nei dati di base CFS. |
| **Processo** | Un caricamento di dati nel CFS, identificato da un periodo (mese/anno) e uno scenario (Actual, Budget, ecc.). |
| **Perimetro (Scope)** | Il perimetro di consolidamento che determina quali livelli di rettifica sono visibili. |
| **Riclassificazione** | La struttura gerarchica delle voci di bilancio consolidato (P&L, Stato Patrimoniale, ecc.). |
| **Ragged** | Una gerarchia in cui non tutti i rami hanno la stessa profondità. |
| **Writeback** | L'operazione con cui l'utente modifica un valore nella griglia e il sistema salva il delta. |
