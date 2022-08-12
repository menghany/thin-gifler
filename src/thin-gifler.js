import { GifReader } from 'omggif'
class Animator {
  /* ---
    head : 'animator::createBufferCanvas()'
    text :
      - >
        Creates a buffer canvas element since it is much faster
        to call <b>.putImage()</b> than <b>.putImageData()</b>.
      - >
        The omggif library decodes the pixels into the full gif
        dimensions. We only need to store the frame dimensions,
        so we offset the putImageData call.
    args :
      frame  : A frame of the GIF (from the omggif library)
      width  : width of the GIF (not the frame)
      height : height of the GIF
    return : A <canvas> element containing the frame's image.
    */
  static createBufferCanvas(frame, width, height) {
    // Create empty buffer
    const bufferCanvas = document.createElement('canvas')
    const bufferContext = bufferCanvas.getContext('2d')
    bufferCanvas.width = frame.width
    bufferCanvas.height = frame.height
    // Create image date from pixels
    const imageData = bufferContext.createImageData(width, height)
    imageData.data.set(frame.pixels)
    // Fill canvas with image data
    bufferContext.putImageData(imageData, -frame.x, -frame.y)
    return bufferCanvas
  }
  constructor(_reader, _frames) {
    this._nextFrame = this._nextFrame.bind(this)
    this._nextFrameRender = this._nextFrameRender.bind(this)
    this._advanceFrame = this._advanceFrame.bind(this)
    this._reader = _reader
    this._frames = _frames
    this.width = this._reader.width
    this.height = this._reader.height
    this._loopCount = this._reader.loopCount()
    this._loops = 0
    this._frameIndex = 0
    this._running = false
  }

  /* ---
    head : 'animator.start()'
    text :
      - Starts running the GIF animation loop.
    */
  start() {
    this._lastTime = new Date().valueOf()
    this._delayCompensation = 0
    this._running = true
    setTimeout(this._nextFrame, 0)
    return this
  }

  /* ---
    head : 'animator.stop()'
    text :
      - Stops running the GIF animation loop.
    */
  stop() {
    this._running = false
    return this
  }

  /* ---
    head : 'animator.reset()'
    text :
      - Resets the animation loop to the first frame.
      - Does not stop the animation from running.
    */
  reset() {
    this._frameIndex = 0
    this._loops = 0
    return this
  }

  /* ---
    head : 'animator.running()'
    return : A boolean indicating whether or not the animation is running.
    */
  running() {
    return this._running
  }

  _nextFrame() {
    requestAnimationFrame(this._nextFrameRender)
  }

  _nextFrameRender() {
    if (!this._running) {
      return
    }
    // Render frame with callback.
    const frame = this._frames[this._frameIndex]
    const ref = this.onFrame
    if (ref != null) {
      ref.apply(this, [frame, this._frameIndex])
    }
    return this._enqueueNextFrame()
  }

  _advanceFrame() {
    // If we are at the end of the animation, either loop or stop.
    this._frameIndex += 1
    if (this._frameIndex >= this._frames.length) {
      if (this._loopCount !== 0 && this._loopCount === this._loops) {
        this.stop()
      } else {
        this._frameIndex = 0
        this._loops += 1
      }
    }
  }

  _enqueueNextFrame() {
    let actualDelay, delta, frame, frameDelay
    this._advanceFrame()
    while (this._running) {
      frame = this._frames[this._frameIndex]
      // Perform frame delay compensation to make sure each frame is drawn at
      // the right time. This helps canvas GIFs match native img GIFs timing.
      delta = new Date().valueOf() - this._lastTime
      this._lastTime += delta
      this._delayCompensation += delta
      frameDelay = frame.delay * 10
      actualDelay = frameDelay - this._delayCompensation
      this._delayCompensation -= frameDelay
      // Skip frames while our frame timeout is negative. This is necessary
      // because browsers such as Chrome will disable javascript while the
      // window is not in focus. When we re-focus the window, it would attempt
      // render all the missed frames as fast as possible.
      if (actualDelay < 0) {
        this._advanceFrame()
      } else {
        setTimeout(this._nextFrame, actualDelay)
        break
      }
    }
  }

  /* ---
    head : 'animator.animateInCanvas()'
    text :
      - >
        This method prepares the canvas to be drawn into and sets up
        the callbacks for each frame while the animation is running.
      - >
        To change how each frame is drawn into the canvas, override
        <b>animator.onDrawFrame()</b> before calling this method.
        If <b>animator.onDrawFrame()</b> is not set, we simply draw
        the frame directly into the canvas as is.
      - >
        You may also override <b>animator.onFrame()</b> before calling
        this method. onFrame handles the lazy construction of canvas
        buffers for each frame as well as the disposal method for each frame.
    args :
      canvas        : A canvas element.
      setDimensions : 'OPTIONAL. If true, the canvas width/height will be set to match the GIF. default: true.'
    */
  animateInCanvas(canvas, setDimensions = true) {
    if (setDimensions) {
      canvas.width = this.width
      canvas.height = this.height
    }
    const ctx = canvas.getContext('2d')
    if (this.onDrawFrame == null) {
      this.onDrawFrame = function(ctx, frame) {
        return ctx.drawImage(frame.buffer, frame.x, frame.y)
      }
    }
    if (this.onFrame == null) {
      this.onFrame = (frame, i) => {
        let ref, saved
        // Lazily create canvas buffer.
        if (frame.buffer == null) {
          frame.buffer = Animator.createBufferCanvas(frame, this.width, this.height)
        }
        if (typeof this.disposeFrame === 'function') {
          this.disposeFrame()
        }
        switch (frame.disposal) {
          case 2:
            this.disposeFrame = function() {
              return ctx.clearRect(0, 0, canvas.width, canvas.height)
            }
            break
          case 3:
            saved = ctx.getImageData(0, 0, canvas.width, canvas.height)
            this.disposeFrame = function() {
              return ctx.putImageData(saved, 0, 0)
            }
            break
          default:
            this.disposeFrame = null
        }
        // Draw current frame.
        return (ref = this.onDrawFrame) != null ? ref.apply(this, [ctx, frame, i]) : void 0
      }
    }
    // Start animation.
    this.start()
    return this
  }
}
class Decoder {
  static decodeFrame(reader, frameIndex) {
    const frameInfo = reader.frameInfo(frameIndex)
    frameInfo.pixels = new Uint8ClampedArray(reader.width * reader.height * 4)
    reader.decodeAndBlitFrameRGBA(frameIndex, frameInfo.pixels)
    return frameInfo
  }
  static decodeFramesSync(reader) {
    const results = []
    for (
      let j = 0, ref = reader.numFrames();
      ref >= 0 ? j < ref : j > ref;
      ref >= 0 ? j++ : j--
    ) {
      results.push(j)
    }
    return results.map(function(frameIndex) {
      return Decoder.decodeFrame(reader, frameIndex)
    })
  }
}
class ThinGifler {
  constructor(gifArrayBuffer) {
    const reader = new GifReader(new Uint8Array(gifArrayBuffer))
    const frames = Decoder.decodeFramesSync(reader)
    this._animator = new Animator(reader, frames)
  }
  frames(canvas, onDrawFrame, setCanvasDimesions = false) {
    this._animator.onDrawFrame = onDrawFrame
    this._animator.animateInCanvas(canvas, setCanvasDimesions)
  }
  stop() {
    this._animator.stop()
  }
}
function thinGiflerAsync(url) {
  return fetch(url)
      .then(response => response.arrayBuffer())
      .then(arrayBuffer => new ThinGifler(arrayBuffer))
}
export {
  thinGiflerAsync
}
export default ThinGifler
