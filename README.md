# Video Helper for CodeceptJS multi-session recording

I wanted to make a nice test recording, one to show to clients and public.

Playwright allows you to record sessions, but creates several separate recordings, one for each session.
This package generates a json file with a test run report that allows you to generate a nice looking video.
It also generates a simple mlt file that can be played back or used to generate a recording with the melt command.

## Installation

```
  npm install --save-dev conceptjs-video-helper
```

## Usage

codecept.conf.js

```js
 helpers: {
  VideoHelper: {
    require: 'codeceptjs-video-helper'
  },
  Playwright: {
    browser: 'chromium',
    url: 'http://localhost:8001',
    show: false,
    emulate: {
      recordVideo: {
        dir: "./recordings"
      }
    }
  }
}

```

The `scenario.mlt` and `scenario.json` files will be placed in the recordings directory
You can run [melt](https://www.mltframework.org/docs/melt/) to merge videos together:

```
  melt recordings/scenario.mlt
```

## TODO

- Create better video renderer
