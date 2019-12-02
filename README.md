# Airbnb scraping

This program is capable of navigating and scraping the majority of airbnb style of pages (there are many configurations!). In particular, it is able to:
* Navigate to the canadian airbnb website automatically.
* Disable the canadian airbnb website's tracking cookies.
* Select a city to investigate.
* TODO: Optionally select a date range.
* Find all the rooms that are listed in a city within the selected date range.
* Scrape each room for information.
* Scrape each host and cohost for information.
* Output scraped information into json and csv files.
* Continue processing in the face of scraping errors.
* Output scraping failures into a json file.

# Command use

## Installation instructions

The project is written in [TypeScript](https://www.typescriptlang.org/) using the standard [JavaScript](https://en.wikipedia.org/wiki/JavaScript) package manager [npm](https://www.npmjs.com/). Thus the source code that you download from Peter will not contain everything required to run and you will have a number of commands to run to setup the environment for it to run correctly.

### Computer prerequisites for running

You will need to install a number of packages on your computer in order to be able to run `npm` and ultimately this scraper.

* Download the latest LTS version of [Node.Js](https://nodejs.org/en/) (at least version 12).

* Familiarity with a terminal program. All operating systems have them available.

### Computer prerequisites for modifying

If you wish to be able to make changes to the code you will need to have some kind of tool on your machine to be able to view and modify the `TypeScript`. Something like [Visual Studio Code](https://code.visualstudio.com/) is free and works on Windows, Mac, and Linux.

### Get the program from Peter

***TBD***

NOTE: Do not install on UofC's downtown shared drive as it is too slow to work correctly (since its drives are actually located on main campus).

## Running instructions

To run the program for the first time you will have to get all the 3rd party libraries used by the scraper. This is done using the following commands in a terminal:

```
cd <to the directory you've installed the scraper>

npm install
```

Once all the 3rd party libraries have been fetched onto your computer you can transpile the TypeScript to JavaScript. This is done by:

```
npm run build
```

If you believe that you will be modifying the scraper's code, then instead you will want to do the following and make sure you keep this terminal window until you are finished your "debugging" sessions:

```
npm run build:watch
```

## Operation

The scraper performs 3 major tasks:

1. Collects a list of all the rooms in a city.
2. Collects information for all the rooms provided.
3. Collects information for all the hosts and cohosts provided.

Under normal operating conditions it will progress from step 1 to 2 to 3 seamlessly. However, webscraping is a fickle game. The websites frequently change. The scraper attempts to indicate whenever its assumptions about the "shape" of the webpage are not valid. 

When these assumptions are not valid, the scraper will capture the reason for the failure and the location in the code which generated the failure into a failures file. It will also attempt to capture a picture of the webpage and the DOM of the webpage that caused the problem. Combined these should be sufficient for a post mortem analysis. More importantly, however, is that the failure file from the room scraping or host scraping can be used to restart the process at that point. This means you don't have to restart the whole process (which can take hours to run) when there are just a few errors.

However, it should be pointed out that there will need to be some manually merging of corrected failures into the previous successfully generated room or host information.

```
node ./dist/puppeteer.js --out data/ --city "Red Deer" --province AB --maxPagesOpen 6 --headless
```

There are a few things to notice about this command:

1. It uses the `node` program that you downloaded previously.
2. It contains an `--out data/` command line parameter. This will cause the scraper to create its output files in this directory. The can be any directory you want so long as you have write permission to it.
3. `--headless` indicates that the browser will not show you the webpages that it working on. If you omit this flag, you can see the work that is being done in realtime. It's kind of cool to watch once to get a feel for what the scraper has to do to navigate the website.
4. `--maxPagesOpen 6` indicates that the browser may have up to 6 tabs open at a time - each one scraping a different url. Having more of these will speed the progress while presumably increasin the risk of tipping off airbnb's detectors. Since the process of scraping is generally I/O bound, you will find improvements in processing time up to the point that your network is not being bottlenecked by adding more workers.

You can find more information about the parameters and flags that are available by invoking the help:
```
node ./dist/puppeteer.js --help
```

## Artifacts

Each stage produces aritfacts that can be analyzed and used as inputs to subsequent stages.

### Collects a list of all the rooms in a city.

Creates:
* `<out dir>/<YYYYMMDD>_<city>_<province>_airbnb_basic_data.csv`
* `<out dir>/<YYYYMMDD>_<city>_<province>_airbnb_basic_data.json`

These contain a list of room ids that were discovered for this city/province

### Collects information for all the rooms provided.

Creates:
* `<out dir>/<YYYYMMDD>_<city>_<province>_airbnb_room_data.csv`
* `<out dir>/<YYYYMMDD>_<city>_<province>_airbnb_room_data.json`
* `<out dir>/<YYYYMMDD>_<city>_<province>_airbnb_room_failures.json`
* `<out dir>/<YYYYMMDD>_<city>_<province>_airbnb_room_host_data.csv`
* `<out dir>/<YYYYMMDD>_<city>_<province>_airbnb_room_host_data.json`

The failures file will be created regardless of there being any failures. You will have to examine it to see if there are any roomIds in the failure list. The program will not continue to the next step, collecting host information, if there are errors.

The `..._room_data.*` files contain scraped information about the rooms.
The `..._room_host_data.*` files contain a list of hosts and cohosts that are associated with the rooms.

### Collects information for all the hosts and cohosts provided.

Creates:
* `<out dir>/<YYYYMMDD>_<city>_<province>_airbnb_host_data.csv`
* `<out dir>/<YYYYMMDD>_<city>_<province>_airbnb_host_data.json`
* `<out dir>/<YYYYMMDD>_<city>_<province>_airbnb_host_failures.json`

These files contain scraped information about the hosts and cohosts.