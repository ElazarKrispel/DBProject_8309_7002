# איך מצלמים את 24 צילומי המסך של שלב ד

מדריך תפעולי, שלב אחרי שלב, מהרגע שהמחשב דלוק ועד שכל 24 התמונות נמצאות בתיקייה הנכונה
והדוח נראה שלם. אין צורך לדעת כלום מראש – כל פקודה כתובה במלואה.

> **הכול בטוח.** כל בלוק שמשנה נתונים עטוף ב-`BEGIN ... ROLLBACK`, ולכן אי אפשר להרוס
> את בסיס הנתונים בטעות. אפילו אם תריץ בלוק פעמיים – המצב חוזר לעצמו.

---

## חלק 0 – מה צריך שיהיה מותקן

| דרישה | איך בודקים |
|---|---|
| Docker Desktop רץ | האייקון בשורת המשימות ירוק / "Engine running" |
| הרפוזיטורי קיים מקומית | התיקייה `DBProject_8309_7002` על שולחן העבודה |
| דפדפן | כל דפדפן, בשביל pgAdmin |

---

## חלק 1 – הרמת השרת

### 1.1 פתח PowerShell בתיקיית הפרויקט

```powershell
cd "$HOME\Desktop\DBProject_8309_7002"
```

### 1.2 הרם את הקונטיינרים

```powershell
docker compose up -d
```

זה מרים שני קונטיינרים: `PostgreSQL_DB` (פורט 5432) ו-`pgadminApp` (פורט 8080).

**אם זו הפעם הראשונה אחרי `git pull`** (או אם משהו נראה חסר – למשל אין `uiclient`,
אין Views, אין פרוצדורות): ה-volume הישן מכיל נתונים ישנים. Git לא מסנכרן volumes.
במקרה כזה, ורק במקרה כזה:

```powershell
docker compose down -v
```

```powershell
docker compose up -d
```

ה-`-v` מוחק את ה-volume, וההרמה הבאה משחזרת מאפס את `שלב ד/backup4.sql`.
לוקח בערך **30 שניות**. אין מה לעשות בינתיים חוץ מלחכות.

### 1.3 ודא שהשרת באמת מוכן

```powershell
docker exec -i PostgreSQL_DB psql -U admin_chess -d chess_db -c "SELECT count(*) AS tables FROM information_schema.tables WHERE table_schema='public' AND table_type='BASE TABLE';" -c "SELECT count(*) AS routines FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public';" -c "SELECT count(*) AS triggers FROM pg_trigger WHERE NOT tgisinternal;"
```

**התוצאה חייבת להיות:** `tables = 27`, `routines = 6`, `triggers = 2`.

אם המספרים שונים – חזור ל-1.2 ובצע `docker compose down -v` ואז `up -d`.

---

## חלק 2 – פתיחת pgAdmin וחיבור לבסיס

### 2.1 פתח את pgAdmin

בדפדפן: **http://localhost:8080**

התחברות:

| שדה | ערך |
|---|---|
| Email | `admin_chess@local.com` |
| Password | `admin_chess123` |

הטעינה הראשונה של pgAdmin איטית (10–20 שניות). זה נורמלי.

### 2.2 רשום את השרת (רק בפעם הראשונה, או אחרי `down -v`)

`down -v` מוחק גם את הזיכרון של pgAdmin, ואז השרת נעלם מהעץ. לרשום מחדש:

1. לחיצה ימנית על **Servers** → **Register** → **Server...**
2. לשונית **General** → שדה **Name**: `Chess DB` (שם חופשי, לא משנה)
3. לשונית **Connection** – למלא **בדיוק** כך:

| שדה | ערך | הערה |
|---|---|---|
| Host name/address | `db` | **לא** `localhost`! זהו שם השירות ברשת של Docker |
| Port | `5432` | |
| Maintenance database | `chess_db` | |
| Username | `admin_chess` | |
| Password | `admin_chess123` | סמן **Save password** |

4. **Save**

### 2.3 נווט לבסיס והכן את חלון העבודה

בעץ משמאל:
`Servers` → `Chess DB` → `Databases` → **`chess_db`**

לחץ עליו פעם אחת (שיהיה מסומן), ואז בתפריט העליון: **Tools → Query Tool**
(או האייקון של הברק ⚡).

**חשוב לצילומים יפים:**
- הרחב את החלון של pgAdmin למסך מלא (F11 בדפדפן).
- גרור את הקו המפריד בין עורך ה-SQL לבין לוח התוצאות כך שיהיה מקום לשתי הלשוניות.
- שים לב לשתי הלשוניות בתחתית: **Data Output** ו-**Messages**. הן מה שמצלמים.

### 2.4 טען את קובץ הבלוקים

בתוך ה-Query Tool: אייקון התיקייה **Open File** → נווט אל
`שלב ד/Screenshots_pgAdmin.sql` → **Select**.

> אם pgAdmin לא רואה את הקובץ מהדפדפן, פשוט פתח את הקובץ בעורך טקסט (Notepad++/VS Code)
> ועשה העתק-הדבק של כל התוכן לתוך ה-Query Tool. אימתנו שהקובץ הוא SQL טהור בלי אף
> פקודת `psql`, ולכן העתק-הדבק עובד מצוין.

---

## חלק 3 – איך מצלמים בלוק אחד (הנוהל שחוזר על עצמו 20 פעם)

זהו הלולאה. תבצע אותה לכל בלוק:

1. **סמן בעכבר את כל הבלוק** – מהשורה הראשונה של ה-SQL ועד הנקודה-פסיק האחרונה שלו.
   את שורות ההערה שמעליו (`-- BLOCK 07 ...`) אפשר לכלול או לא, לא משנה.
2. **לחץ `F5`** (או כפתור ה-▶ ). pgAdmin מריץ **רק את מה שמסומן**.
   > ⚠️ **אל תריץ את כל הקובץ בבת אחת.** בלי סימון, `F5` מריץ הכול, והפלט מתערבב.
3. **בחר את הלשונית הנכונה** לפי התגית בכותרת הבלוק:
   - `[DATA]` → לשונית **Data Output**
   - `[MSG]` → לשונית **Messages**
   - `[DATA+MSG]` → **שני צילומים**, אחד מכל לשונית
4. **צלם:** `Win + Shift + S` → סמן מלבן סביב האזור → התמונה נשמרת ללוח.
   > צלם אזור שכולל **גם את ה-SQL שרץ וגם את התוצאה**. כך בהגנה רואים מייד מה הופעל.
5. **שמור:** פתח **Paint** (`Win` → הקלד `paint` → Enter) → `Ctrl+V` → `Ctrl+S` →
   נווט אל `Desktop\DBProject_8309_7002\שלב ד\screenshots\` →
   **File name** = השם המדויק מהכותרת של הבלוק → **Save as type** = `PNG` → **Save**.

> **חלופה מהירה יותר:** במקום Paint, `Win + Print Screen` שומר צילום מסך מלא אוטומטית
> לתיקייה `Pictures\Screenshots`. אבל אז צריך לשנות שם ולהעביר ידנית. הנוהל עם
> `Win+Shift+S` + Paint מהיר יותר בסך הכול כי הוא שומר ישר לשם הנכון.

### שגיאות זה בסדר גמור

בלוקים 03, 04, 07, 11, 12, 16 **אמורים** להסתיים ב-`ERROR` אדום. זו בדיוק ההוכחה
שהחריגות עובדות. אחרי בלוק כזה **אין צורך לעשות שום דבר** – לא `ROLLBACK`, לא כלום –
כי לא נפתחה טרנזקציה. פשוט המשך לבלוק הבא.

---

## חלק 4 – רשימת 24 הצילומים (סמן ✔ תוך כדי)

### מתוך `Screenshots_pgAdmin.sql`

| # | בלוק | לשונית | שם הקובץ | הערה מיוחדת |
|:-:|---|---|---|---|
| 1 | 01 | Data Output | `01_install.png` | – |
| 2 | 02 | Data Output | `02_fn1_run.png` | – |
| 3 | 03 | Messages | `03_fn1_err_player.png` | שגיאה מכוונת |
| 4 | 04 | Messages | `04_fn1_err_param.png` | שגיאה מכוונת |
| 5 | 05 | Data Output | `05_fn2_israel.png` | **סמן את כל 4 השורות יחד** |
| 6 | 06 | Data Output | `06_fn2_all.png` | **סמן את כל 4 השורות יחד** |
| 7 | 07 | Messages | `07_fn2_err_param.png` | שגיאה מכוונת |
| 8 | 08 | Data Output | `08_sp1_proof.png` | בלוק ארוך – סמן מ-`BEGIN;` עד `ROLLBACK;` |
| 9 | 08 | Messages | `08_sp1_messages.png` | אותה הרצה, לשונית שנייה |
| 10 | 09 | Data Output | `09_sp1_counts.png` | – |
| 11 | 10 | Data Output | `10_sp2_proof.png` | – |
| 12 | 10 | Messages | `10_sp2_messages.png` | אותה הרצה, לשונית שנייה |
| 13 | 11 | Messages | `11_sp2_err_param.png` | שגיאה מכוונת |
| 14 | 12 | Messages | `12_trg1_reject.png` | שגיאה מכוונת |
| 15 | 13 | Data Output | `13_trg1_pass.png` | – |
| 16 | 14 | Data Output | `14_trg1_cascade.png` | – |
| 17 | 14 | Messages | `14_trg1_cascade_messages.png` | אותה הרצה, לשונית שנייה |
| 18 | 15 | Data Output | `15_trg2_complete.png` | – |
| 19 | 15 | Messages | `15_trg2_complete_messages.png` | אותה הרצה, לשונית שנייה |
| 20 | 16 | Messages | `16_trg2_reject.png` | שגיאה מכוונת |

**למה בלוקים 05 ו-06 שונים:** קורסור ב-PostgreSQL חי רק בתוך הטרנזקציה שפתחה אותו.
אם תריץ את `SELECT fn_club_report(...)` לבד – הקורסור ייסגר לפני שתספיק לעשות לו
`FETCH`, ותקבל `cursor "club_report_cur" does not exist`. לכן חייבים לסמן את
`BEGIN;` / `SELECT` / `FETCH ALL` / `COMMIT;` **יחד** ולהריץ במכה אחת.

**מה אמור להיראות בצילום 12 (`10_sp2_proof.png`)** – זה הצילום החשוב ביותר בדוח,
כי הוא מוכיח שלושה דברים בבת אחת:

| table_name | status_code | before | after | delta | מי גרם לזה |
|---|---|---|---|---|---|
| club_membership | active | 14945 | 14909 | **-36** | טריגר 1 (קסקייד חסימה) |
| club_membership | banned | 601 | 637 | **+36** | טריגר 1 |
| club_membership | pending | 979 | 912 | **-67** | ה-`DELETE` שבפרוצדורה |
| player | active | 296 | 275 | **-21** | ה-`UPDATE` שבפרוצדורה |
| player | banned | 14 | 15 | **+1** | ה-`UPDATE` שבפרוצדורה |
| player | suspended | 200 | 220 | **+20** | ה-`UPDATE` שבפרוצדורה |

### מתוך `Main1_BillingAndActivity.sql`

**סגור את הלשונית הנוכחית ופתח Query Tool חדש** (Tools → Query Tool), ובו
**Open File** → `שלב ד/Main1_BillingAndActivity.sql`.

| # | מה מסמנים | לשונית | שם הקובץ |
|:-:|---|---|---|
| 21 | הכול (`Ctrl+A`) ואז `F5` | Messages | `17_main1_messages.png` |
| 22 | מ-`STEP 1` עד סוף `STEP 5` ואז `F5` | Data Output | `18_main1_proof.png` |

בצילום 22 צריך להופיע בגריד: מנוי `5050`, `monthly`,
`date_before = 2018-02-20` ← `date_after = 2018-03-20`.

### מתוך `Main2_SecurityAndClubs.sql`

**Query Tool חדש** → **Open File** → `שלב ד/Main2_SecurityAndClubs.sql`.

| # | מה מסמנים | לשונית | שם הקובץ |
|:-:|---|---|---|
| 23 | הכול (`Ctrl+A`) ואז `F5` | Messages | `19_main2_messages.png` |
| 24 | מ-`STEP 1` עד סוף `STEP 5` ואז `F5` | Data Output | `20_main2_after.png` |

בצילום 24 צריך להופיע: `active 14909`, `banned 637`, `left 2809`, `pending 912`.

---

## חלק 5 – בונוס: צילומי הקוד עצמו בעץ של pgAdmin

לא חובה לדוח, אבל מרשים בהגנה ולוקח 30 שניות. בעץ משמאל:

`chess_db` → `Schemas` → `public` → `Functions` / `Procedures` / `Trigger Functions`

לחיצה על כל אחת מהן מציגה בלשונית **SQL** את הקוד המלא **כולל ההערות שכתבנו**
(אימתנו: ההערות אכן נשמרות בבסיס הנתונים). הטריגרים עצמם נמצאים תחת
`Tables` → `player` → `Triggers` ו-`Tables` → `login_log` → `Triggers`.

---

## חלק 6 – בדיקה סופית

### 6.1 ודא שיש 24 קבצים בדיוק

```powershell
Get-ChildItem "$HOME\Desktop\DBProject_8309_7002\שלב ד\screenshots" -Filter *.png | Measure-Object | Select-Object Count
```

התוצאה צריכה להיות `24`.

### 6.2 ודא שאין שם קובץ שגוי

```powershell
Get-ChildItem "$HOME\Desktop\DBProject_8309_7002\שלב ד\screenshots" -Filter *.png | Select-Object -ExpandProperty Name | Sort-Object
```

השווה לרשימה בחלק 4. **שם עם טעות אחת = תמונה שבורה בדוח.**
שים לב במיוחד ל-`_messages` בסוף של 08 / 10 / 14 / 15 / 17 / 19.

### 6.3 ודא שהתמונות באמת מופיעות בדוח

פתח את `שלב ד/README.md` ב-VS Code ולחץ `Ctrl+Shift+V` (תצוגה מקדימה).
גלול על פני הפרקים 4–11. כל התמונות אמורות להופיע. אם אחת מופיעה כריבוע שבור –
השם שגוי, תקן אותו.

### 6.4 ודא שבסיס הנתונים חזר למצבו

```powershell
docker exec -i PostgreSQL_DB psql -U admin_chess -d chess_db -c "SELECT (SELECT count(*) FROM player) players, (SELECT count(*) FROM club_membership) memberships, (SELECT count(*) FROM player_subscription) subs, (SELECT count(*) FROM login_log) logins;"
```

חייב להחזיר: `510 | 19334 | 20008 | 19095`. אם כן – כל ה-`ROLLBACK` עבדו כמתוכנן.

---

## חלק 7 – מה עושים אם משהו לא עובד

| תסמין | סיבה | פתרון |
|---|---|---|
| `could not connect to server` ב-pgAdmin | רשמת `localhost` במקום `db` | ערוך את השרת → Connection → Host = `db` |
| `cursor "club_report_cur" does not exist` | הרצת רק את שורת ה-`SELECT` בבלוק 05/06 | סמן את כל 4 השורות יחד |
| `relation "uiclient" does not exist` | ה-volume מכיל בסיס ישן משלב א | `docker compose down -v` ואז `up -d` |
| `current transaction is aborted` | שגיאה קרתה בתוך `BEGIN` פתוח | הרץ `ROLLBACK;` לבד, והתחל את הבלוק מחדש |
| הפלט של הבלוק הקודם מופיע גם עכשיו | לא סימנת את הבלוק לפני `F5` | סמן את הבלוק בלבד והרץ שוב |
| pgAdmin לא נטען ב-8080 | הקונטיינר עוד עולה | חכה 20 שניות ורענן |

---

## חלק 8 – אחרי הצילומים

נשארו שני דברים לסגירת השלב:

1. **מעבר על הדוח** – `שלב ד/README.md`, פרקים 4–11. כל המספרים בו הם פלטים אמיתיים
   מהרצות. ודא שאתה מבין את ההסבר של כל תוכנית – זה מה שתסביר בהגנה.

2. **Commit + Tag:**

```bash
git add "שלב ד" docker-compose.yml README.md && git commit -m "Stage 4: PL/pgSQL programs" && git tag Stage_4
```

> שים לב: בגיט קיים כרגע רק התג `Stage_1`. שלבים ב' ו-ג' לא תוייגו, וזו דרישה בכל
> שלב. שווה להוסיף אותם רטרואקטיבית על הקומיטים המתאימים.
