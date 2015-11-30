/// <reference path='./myers_state.ts'/>
/// <reference path='./snapsvg.d.ts'/>

class GridLocation {
  constructor(public x:number, public y:number) {}

  offset(dx:number, dy:number):GridLocation {
    return new GridLocation(this.x + dx, this.y + dy)
  }
}

function hypot(dx:number, dy:number):number {
  return Math.sqrt(dx * dx + dy * dy)
}

class Cursor {
  current:Point
  points:Point[] = []
  strokes:Line[] = []

  tryStroke() {
    var pointCount = this.points.length
    if (pointCount >= 2) {
      this.strokes.push(new Line(this.points[pointCount-2], this.points[pointCount-1]))
    }
  }

  move(dx:number, dy:number, addStroke:boolean = true):Cursor {
    if (dx != 0 || dy != 0) {
      this.current = {x:this.current.x + dx, y:this.current.y + dy}
      this.points.push(this.current)
      if (addStroke) {
        this.tryStroke()
      }
    }
    return this
  }

  moveAsIfFrom(start:Point, end:Point):Cursor {
    return this.move(end.x - start.x, end.y - start.y)
  }

  moveX(dx:number, addStroke:boolean = true):Cursor {
    return this.move(dx, 0, addStroke)
  }

  moveY(dy:number, addStroke:boolean = true):Cursor {
    return this.move(0, dy, addStroke)
  }

  close(addStroke:boolean = true):Cursor {
    this.current = this.points[0]
    this.points.push(this.current)
    if (addStroke) {
      this.tryStroke()
    }
    return this
  }

  // returns alternating x, y coordinates, suitable for SVG
  coordinates():number[] {
    var result:number[] = []
    for (var i = 0; i < this.points.length; i++) {
      result.push(this.points[i].x, this.points[i].y)
    }
    return result
  }

  reset(p:Point) {
    this.current = p
    this.points = []
    this.strokes = []
  }

  constructor(p:Point) {
    this.current = p
    this.points = []
  }
}

interface Ordinals {
  north?:boolean
  east?:boolean
  south?:boolean
  west?:boolean
}

function assert(condition, message) {
    if (!condition) {
        throw message || "Assertion failed";
    }
}

function ewidth(svg:Snap.Element):number {
  var result = <number>svg.attr('width')
  assert(!isNaN(result), "width is NaN")
  return result
}

function eheight(svg:Snap.Element):number {
  var result = <number>svg.attr('height')
  assert(!isNaN(result), "height is NaN")
  return result
}

class MyersIDs {
  constructor(public svg:string, public slider:string, public diff:string,
    public text_input_1:string, public text_input_2:string) {}
}

class MyersGrid {
  input:MyersInput

  width:number
  height:number

  rows:number
  cols:number

  xSpacing:number
  ySpacing:number

  xPadding:number
  yPadding:number

  floodColor = '#AAA'
  gridColor = '#777'
  fillColor = '#B6DCFF'
  snakeFillColor = '#B6DCFF'


  crosses:Snap.Element[] = []
  snakes:Snap.Element[] = []

  svg:Paper

  constructor(svg:Paper, input:MyersInput) {
    this.svg = svg
    this.input = input
    this.rows = input.left.length + 1
    this.cols = input.top.length + 1

    this.width = ewidth(svg)
    this.height = eheight(svg)

    this.xSpacing = this.width / (this.cols)
    this.ySpacing = this.height / (this.rows)

    this.xPadding = this.xSpacing/2
    this.yPadding = this.ySpacing/2

    this.svg.rect(0, 0, this.width, this.height).attr({ fill: this.floodColor})
    this.makeGrid()

    // make crosses
    for (var y = 0; y < this.rows; y++) {
      for (var x=0; x < this.cols; x++) {
        var dirs = {
          north: y > 0 || (y==0 && x==0),
          east: x+1 < this.cols,
          south: y+1 < this.rows,
          west: x > 0
        }
        this.makeCross(new GridLocation(x, y), dirs, false)
      }
    }

    // make snakes
    for (var y = 0; y+1 < this.rows; y++) {
      for (var x=0; x+1 < this.rows; x++) {
        if (this.input.left[y] == this.input.top[x]) {
          this.makeSnake(new GridLocation(x, y))
        }
      }
    }
  }

  pointForLocation(gl:GridLocation):CPoint {
    return new CPoint(this.xPadding + this.xSpacing * gl.x, this.yPadding + this.ySpacing * gl.y)
  }

  addStrokes(c:Cursor):Snap.Element {
    let group:any = this.svg.group()
    for (let i=0; i < c.strokes.length; i++) {
      let line = c.strokes[i]
      group.add(this.svg.line(line.start.x, line.start.y, line.end.x, line.end.y))
    }
    return group
  }

  makeGrid() {
    var attrs = { stroke: this.gridColor, 'strokeWidth': 0.5}
    // horizontal lines
    for (var r=0; r<this.rows; r++) {
      var y = this.pointForLocation(new GridLocation(0, r)).y
      this.svg.line(0, y, this.width, y).attr(attrs)
    }
    // vertical lines
    for (var c=0; c < this.cols; c++) {
      var x = this.pointForLocation(new GridLocation(c, 0)).x
      this.svg.line(x, 0, x, this.height).attr(attrs)
    }
  }

  makeCross(center:GridLocation, extend:Ordinals, snake:boolean) {
    var north = extend.north, east = extend.east
    var south = extend.south, west = extend.west
    // fraction of a square taken up by the center
    var centerFraction = .33
    var horizShort = this.xSpacing * centerFraction
    var horizLong = (this.xSpacing - horizShort) / 2

    var vertShort = this.ySpacing * centerFraction
    var vertLong = (this.ySpacing - vertShort) / 2

    // we don't fill the edges of the crosses
    var strokeLines : number[][] = []

    var c = new Cursor(this.pointForLocation(center))

    // northwest
    c.move(-horizShort/2, -vertShort/2)

    // northwest -> southwest
    c.moveX(west ? -horizLong : 0)
    c.moveY(vertShort, !west)
    c.moveX(west ? horizLong : 0)

    // southwest -> southeast
    c.moveY(south ? vertLong : 0)
    c.moveX(horizShort, !south)
    c.moveY(south ? -vertLong : 0)

    // southeast -> northeast
    c.moveX(east ? horizLong : 0)
    c.moveY(-vertShort, !east)
    c.moveX(east ? -horizLong : 0)

    // northwest -> northeast
    c.moveY(north ? -horizLong : 0)
    c.moveX(-horizShort, !north)
    c.moveY(north ? horizLong : 0)

    var fillAttrs = { stroke: 'none', fill: this.fillColor}
    this.crosses.push(this.svg.polygon(c.coordinates()).attr(fillAttrs))

    var strokeAttrs = { stroke: 'black', 'strokeWidth': 1.25, fill: 'none'}
    this.crosses.push(this.addStrokes(c).attr(strokeAttrs))
  }

  makeSnake(centerGL:GridLocation)  {
    var center = this.pointForLocation(centerGL)
    var rectFraction = .33
    var rectThickness = rectFraction * (this.xSpacing + this.ySpacing) / 2.0

    var start = center
    var target = this.pointForLocation(centerGL.offset(1, 1))
    var distance = hypot(target.x - start.x, target.y - start.y)

    // rotate a rectangle centered at the origin
    // conceptually the width of the rectangle is the line that connects the
    // start and target points, and the height is perpindicular
    var angle = Math.atan2(target.y - start.y, target.x - start.x)
    function rotate(x:number, y:number):Point {
      return {
        x:x * Math.cos(angle) - y * Math.sin(angle),
        y:x * Math.sin(angle) + y * Math.cos(angle)
      }
    }
    var short = rotate(0, rectThickness)
    short.x = Math.abs(short.x)
    short.y = Math.abs(short.y)

    var long = rotate(distance, 0)
    long.x = Math.abs(long.x)
    long.y = Math.abs(long.y)

    var c = new Cursor(center)
    c.move(short.x/2, -short.y/2) //northwest
    c.move(-short.x, short.y) //southwest
    c.move(long.x, long.y) //southeast
    c.move(short.x, -short.y) //northeast
    c.close()

    var pathAttrs = { fill: this.snakeFillColor }
    var borderAttrs = { fill: 'none', stroke: 'black', strokeWidth: 1.25 }
    this.snakes.push(this.svg.polygon(c.coordinates()).attr(pathAttrs))

    // do something hacky
    var squish = .60
    var slideRatio = .6
    var slideX = (long.x * (1-squish)) * slideRatio
    var slideY = (long.y * (1-squish)) * slideRatio
    var squishCenter = {x:center.x + slideX, y:center.y + slideY}
    long.x *= squish
    long.y *= squish

    c.reset(squishCenter)
    c.move(short.x/2, -short.y/2) //northwest
    c.move(long.x, long.y) //northeast
    this.snakes.push(this.addStrokes(c).attr(borderAttrs))

    c.reset(squishCenter)
    c.move(-short.x/2, short.y/2) //southwest
    c.move(long.x, long.y) //southeast
    this.snakes.push(this.addStrokes(c).attr(borderAttrs))
  }
}

class MyersUI {
  ids:MyersIDs
  input:MyersInput
  svg:Paper

  grid:MyersGrid

  constructor(ids:MyersIDs, input:MyersInput) {
    this.ids = ids
    this.input = input

    this.buildUI()
  }

  buildUI() {
    this.svg = Snap(this.ids.svg)
    this.svg.clear()

    var gridSvg = Snap(380, 380)
    this.grid = new MyersGrid(gridSvg, this.input)
    this.svg.append(gridSvg)

  }
}