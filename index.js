const path = require('path')
const fs = require('fs')
const Helper = require('@codeceptjs/helper')

class VideoHelper extends Helper {
  _init() {
    this.events = []
    this.start = Date.now()
  }

  async _finishTest() {
    const pw = this.helpers.Playwright
    //console.log("PW", pw)
    let videoDir = pw.config?.emulate?.recordVideo?.dir
    if(!videoDir) return
    const mainVideo = pw.page.video()
    let mainVideoPath = mainVideo && await mainVideo.path()
    if(mainVideoPath) mainVideoPath = path.relative(videoDir, mainVideoPath)
    this.start = this.events[0].at
    for(const event of this.events) {
      if(event.video) {
        event.video = path.relative(videoDir, await event.video.path())
      }
      event.at -= this.start
    }
    const scenarioJson = this.events.map(x => JSON.stringify(x)).join('\n')
    //console.log("EVENTS:\n" + scenarioJson)

    await fs.promises.writeFile(path.resolve(videoDir, 'scenario.json'), scenarioJson)
    const videos = Array.from(new Set(
      [mainVideoPath].concat(this.events.map(ev => ev.video).filter(x => !!x))
    ))
    const producers = videos.map(video =>
      `  <producer id="${path.basename(video).split('.')[0]}">\n` +
      `    <property name="resource">${video}</property>\n` +
      `  </producer>`
    ).join('\n')

    const fps = 25 // TODO: read from configuration
    const timePerFrame = 1000 / fps

    let sessionProducers = new Map()
    let entries = []
    let lastProducerChange = 0
    const mainProducer = {
      id: path.basename(mainVideoPath).split('.')[0],
      start: 0
    }
    let currentProducer = mainProducer
    function changeProducer(to, at) {
      entries.push(`<entry producer="${currentProducer.id}" ` +
        `in="${((lastProducerChange - currentProducer.start) / timePerFrame) | 0}" ` +
        `out="${((at - currentProducer.start) / timePerFrame) | 0}"></entry>`)

      currentProducer = to
      lastProducerChange = at
    }
    for(let event of this.events) {
      if(event.type == 'startSession') {
        const sessionProducer = {
          id: path.basename(event.video).split('.')[0],
          start: event.at
        }
        sessionProducers.set(event.session, sessionProducer)
      }
      if(event.type == 'enterSession') {
        const nextProducer = sessionProducers.get(event.session)
        changeProducer(nextProducer, event.at)
      }
      if(event.type == 'leaveSession') {
        changeProducer(mainProducer, event.at)
      }
    }
    entries.push(`<entry producer="${currentProducer.id}" ` +
      `in="${((lastProducerChange - currentProducer.start) / timePerFrame) | 0}" ` +
      `out="${((this.events.slice(-1)[0].at - currentProducer.start) / timePerFrame) | 0}"></entry>`)


    const multitrack =
      `  <tractor>\n` +
      `    <multitrack>\n` +
      `      <playlist>\n` +
      `        `+entries.join('\n        ') + '\n' +
      `      </playlist>\n` +
      `    </multitrack>\n` +
      `  </tractor>`

    const mlt = `<mlt>\n${producers}\n${multitrack}\n</mlt>`
    //console.log("MLT:\n"+mlt)
    await fs.promises.writeFile(path.resolve(videoDir, 'scenario.mlt'), mlt)
  }

  async videoWait(n) {
     const pw = this.helpers.Playwright
    if(pw.config?.emulate?.recordVideo) await pw.wait(n)
  }

  _session(...args) {
    const pw = this.helpers.Playwright
    const session = pw._session(...args)
    const pwSessionStart = session.start
    const pwSessionStop = session.stop
    const pwSessionLoadVars = session.loadVars
    const pwSessionRestoreVars = session.restoreVars
    let savedSessionName
    session.start = async (sessionName, config) => {
      //console.log("SESSION START", sessionName)
      savedSessionName = sessionName
      const emulate = pw.config?.emulate
      const recordVideo = emulate?.recordVideo
      const context = await pwSessionStart.call(session, sessionName, {
        ...emulate,
        recordVideo,
        ...config
      })
      const page = context._pages.values().next()?.value
      const video = page?.video()
      this.events.push({ type: 'startSession', session: sessionName, at: Date.now(), video })
      return context
    }
    session.stop = (...args) => {
      this.events.push({ type: 'stopSession', session: savedSessionName, at: Date.now() })
      return pwSessionStop.apply(session, args)
    }
    session.restoreVars = (...args) => {
      this.events.push({ type: 'leaveSession', session: savedSessionName, at: Date.now() })
      return pwSessionRestoreVars.apply(session, args)
    }
    session.loadVars = (...args) => {
      this.events.push({ type: 'enterSession', session: savedSessionName, at: Date.now() })
      return pwSessionLoadVars.apply(session, args)
    }

    return session
  }

  _beforeSuite(suite) {
    this.events.push({ type: 'enterSuite', suite: suite.title, at: Date.now() })
  }
  _afterSuite(suite) {
    this.events.push({ type: 'leaveSuite', suite: suite.title, at: Date.now() })
  }
  _before(test) {
    this.currentTest = test.title
    this.events.push({ type: 'enterTest', test: test.title, at: Date.now() })
  }
  _after(test) {
    this.events.push({ type: 'leaveTest', test: this.currentTest, at: Date.now() })
    this.currentTest = null
  }
  _beforeStep(step) {
    const pw = this.helpers.Playwright
    const page = pw.browserContext._pages.values().next()?.value
    const video = page?.video()
    this.events.push({
      type: 'enterStep', prefix: step.prefix, actor: step.actor, args: step.args, suffix: step.suffix,
      at: Date.now(),
      video
    })
  }
  _afterStep(step) {
    this.events.push({
      type: 'leaveStep',
      actor: step.actor, action: step.name, args: step.args,
      humanizedName: step.humanize(),
      humanizedArgs: step.humanizeArgs(),
      prefix: step.prefix, suffix: step.suffix,
      at: Date.now()
    })
  }
  _passed(test) {
    this.events.push({ type: 'testPassed', test: test.title, at: Date.now() })
  }
  _failed(test) {
    this.events.push({ type: 'testFailed', test: test.title, at: Date.now() })
  }

}

module.exports = VideoHelper