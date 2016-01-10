var SvgUtils = require('./svg-utilities')
  , Utils = require('./utilities')
  ;

var ShadowViewport = function(viewport, options){
  this.init(viewport, options)
}

/**
 * Initialization
 *
 * @param  {SVGElement} viewport
 * @param  {Object} options
 */
ShadowViewport.prototype.init = function(viewport, options) {
  // DOM Elements
  this.viewport = viewport
  this.options = options

  // State cache
  this.originalState = {zoomX: 1, zoomY: 1, x: 0, y: 0}
  this.activeState = {zoomX: 1, zoomY: 1, x: 0, y: 0}

  this.updateCTMCached = Utils.bind(this.updateCTM, this)

  // Create a custom requestAnimationFrame taking in account refreshRate
  this.requestAnimationFrame = Utils.createRequestAnimationFrame(this.options.refreshRate)

  // ViewBox
  this.viewBox = {x: 0, y: 0, width: 0, height: 0}
  this.cacheViewBox()

  // Process CTM
  this.processCTM()

  // Update CTM in this frame
  this.updateCTM()
}

/**
 * Cache initial viewBox value
 * If no viewBox is defined, then use viewport size/position instead for viewBox values
 */
ShadowViewport.prototype.cacheViewBox = function() {
  var svgViewBox = this.options.svg.getAttribute('viewBox')

  if (svgViewBox) {
    var viewBoxValues = svgViewBox.split(/[\s\,]/).filter(function(v){return v}).map(parseFloat)

    // Cache viewbox x and y offset
    this.viewBox.x = viewBoxValues[0]
    this.viewBox.y = viewBoxValues[1]
    this.viewBox.width = viewBoxValues[2]
    this.viewBox.height = viewBoxValues[3]

    var zoom = Math.min(this.options.width / this.viewBox.width, this.options.height / this.viewBox.height)

    // Update active state
    this.activeState.zoomX = zoom
    this.activeState.zoomY = zoom
    this.activeState.x = (this.options.width - this.viewBox.width * zoom) / 2
    this.activeState.y = (this.options.height - this.viewBox.height * zoom) / 2

    // Force updating CTM
    this.updateCTMOnNextFrame()

    this.options.svg.removeAttribute('viewBox')
  } else {
    var bBox = this.viewport.getBBox();

    // Cache viewbox sizes
    this.viewBox.x = bBox.x;
    this.viewBox.y = bBox.y;
    this.viewBox.width = bBox.width
    this.viewBox.height = bBox.height
  }
}

/**
 * Recalculate viewport sizes and update viewBox cache
 */
ShadowViewport.prototype.recacheViewBox = function() {
  var boundingClientRect = this.viewport.getBoundingClientRect()
    , viewBoxWidth = boundingClientRect.width / this.getZooms().zoomX
    , viewBoxHeight = boundingClientRect.height / this.getZooms().zoomY

  // Cache viewbox
  this.viewBox.x = 0
  this.viewBox.y = 0
  this.viewBox.width = viewBoxWidth
  this.viewBox.height = viewBoxHeight
}

/**
 * Returns a viewbox object. Safe to alter
 *
 * @return {Object} viewbox object
 */
ShadowViewport.prototype.getViewBox = function() {
  return Utils.extend({}, this.viewBox)
}

/**
 * Get initial zoom and pan values. Save them into originalState
 * Parses viewBox attribute to alter initial sizes
 */
ShadowViewport.prototype.processCTM = function() {
  var newCTM = this.getCTM()

  // Cache initial values
  this.originalState.zoomX = newCTM.a
  this.originalState.zoomY = newCTM.d
  this.originalState.x = newCTM.e
  this.originalState.y = newCTM.f

  // Update viewport CTM and cache zoom and pan
  this.setCTM(newCTM, '__system');
}

/**
 * Return originalState object. Safe to alter
 *
 * @return {Object}
 */
ShadowViewport.prototype.getOriginalState = function() {
  return Utils.extend({}, this.originalState)
}

/**
 * Return actualState object. Safe to alter
 *
 * @return {Object}
 */
ShadowViewport.prototype.getState = function() {
  return Utils.extend({}, this.activeState)
}

/**
 * Get zoom scales
 *
 * @return {{zoomX: Float, zoomY: Float}} zoom scale
 */
ShadowViewport.prototype.getZooms = function() {
  return {zoomX: this.activeState.zoomX, zoomY: this.activeState.zoomY}
}

/**
 * Get zoom scale for pubilc usage
 *
 * @return {{zoomX: Float, zoomY: Float}} zoom scale
 */
ShadowViewport.prototype.getRelativeZooms = function() {
  return {
    zoomX: this.activeState.zoomX / this.originalState.zoomX
  , zoomY: this.activeState.zoomY / this.originalState.zoomY
  }
}

/**
 * Get pan
 *
 * @return {Object}
 */
ShadowViewport.prototype.getPan = function() {
  return {x: this.activeState.x, y: this.activeState.y}
}

/**
 * Return cached viewport CTM value that can be safely modified
 *
 * @return {SVGMatrix}
 */
ShadowViewport.prototype.getCTM = function() {
  var safeCTM = this.options.svg.createSVGMatrix()

  // Copy values manually as in FF they are not itterable
  safeCTM.a = this.activeState.zoomX
  safeCTM.b = 0
  safeCTM.c = 0
  safeCTM.d = this.activeState.zoomY
  safeCTM.e = this.activeState.x
  safeCTM.f = this.activeState.y

  return safeCTM
}

/**
 * Set a new CTM
 *
 * @param {SVGMatrix} newCTM
 */
ShadowViewport.prototype.setCTM = function(newCTM, namespace) {
  if (this.isZoomDifferent(newCTM) || this.isPanDifferent(newCTM)) {
    var panZoom = this.convertCTMToPanZoom(newCTM)

    // Render only if event is not prevented
    if (this.options.trigger('panzoom', panZoom, namespace)) {
      // Copy panZoom values in case they were modified
      this.copyPanZoomToCTM(panZoom, newCTM)

      // Update
      this.updateCache(newCTM)
      this.updateCTMOnNextFrame()
    }
  }
}

ShadowViewport.prototype.isZoomDifferent = function(newCTM) {
  return this.activeState.zoomX !== newCTM.a && this.activeState.zoomY !== newCTM.d
}

ShadowViewport.prototype.isPanDifferent = function(newCTM) {
  return this.activeState.x !== newCTM.e || this.activeState.y !== newCTM.f
}


/**
 * Update cached CTM and active state
 *
 * @param {SVGMatrix} newCTM
 */
ShadowViewport.prototype.updateCache = function(newCTM) {
  this.activeState.zoomX = newCTM.a
  this.activeState.zoomY = newCTM.d
  this.activeState.x = newCTM.e
  this.activeState.y = newCTM.f
}

ShadowViewport.prototype.pendingUpdate = false

/**
 * Place a request to update CTM on next Frame
 */
ShadowViewport.prototype.updateCTMOnNextFrame = function() {
  if (!this.pendingUpdate) {
    // Lock
    this.pendingUpdate = true

    // Throttle next update
    this.requestAnimationFrame.call(window, this.updateCTMCached)
  }
}

/**
 * Update viewport CTM with cached CTM
 */
ShadowViewport.prototype.updateCTM = function() {
  var CTM = this.getCTM()
    , panZoom = this.convertCTMToPanZoom(CTM)

  // Before render event
  this.options.trigger('before:render')

  // Render only if event is not prevented
  // Has no namespace as it is unknown whos change triggered this render
  if (this.options.trigger('render', panZoom)) {
    // Copy panZoom values in case they were modified
    this.copyPanZoomToCTM(panZoom, CTM)

    // Updates SVG element
    SvgUtils.setCTM(this.viewport, CTM, this.defs)
  }

  // Free the lock
  this.pendingUpdate = false

  // After render event
  this.options.trigger('after:render')
}

/**
 * Converts a CTM object into a PanZoom object with relative zoom
 *
 * @param  {SVGMatrix} CTM CTM point to convert from
 * @return {PanZoom}     PanZoom object
 */
ShadowViewport.prototype.convertCTMToPanZoom = function(CTM) {
  return {
    x: CTM.e
  , y: CTM.f
  , zoomX: CTM.a / this.originalState.zoomX
  , zoomY: CTM.d / this.originalState.zoomY
  }
}

  /**
   * Copies panZoom object values into a CTM object
   *
   * @param  {PanZoom} panZoom Source object
   * @param  {SVGMatrix} CTM     Destination object
   * @return {SVGMatrix}         Destination object
   */
ShadowViewport.prototype.copyPanZoomToCTM = function(panZoom, CTM) {
  CTM.e = panZoom.x
  CTM.f = panZoom.y
  CTM.a = panZoom.zoomX * this.originalState.zoomX
  CTM.d = panZoom.zoomY * this.originalState.zoomY
  return CTM
}

module.exports = function(viewport, options){
  return new ShadowViewport(viewport, options)
}
