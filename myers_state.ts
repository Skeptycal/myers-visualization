interface Point {
  x:number,
  y:number
}

class CPoint {
  constructor(public x:number, public y:number) {}

  moved(dx:number=0, dy:number=0):CPoint {
    return new CPoint(this.x + dx, this.y + dy)
  }
}

function moved(p:Point, dx:number=0, dy:number=0):CPoint {
  return new CPoint(p.x + dx, p.y + dy)
}

class Line {
  constructor(public start:Point, public end:Point) {}
  static make(x1:number, y1:number, x2:number, y2:number):Line {
    return new Line({x:x1, y:y1}, {x:x2, y:y2})
  }
}

class Path {
  points:Point[]

  constructor(points:Point[]) {
    this.points = points.slice(0)
  }

  end():Point {
    assert(this.points.length > 0, "Empty path")
    return this.points[this.points.length-1]
  }

  copy():Path {
    return new Path(this.points)
  }

  plus(p:Point):Path {
    let result = this.copy()
    result.points.push(p)
    return result
  }

  at(idx:number):Point {
    assert(idx >= 0 && idx < this.points.length, "Index out of bounds")
    return this.points[idx]
  }

  description():string {
    let result = ""
    for (let i=0; i < this.points.length; i++) {
      let point = this.points[i]
      if (i > 0) {
        result += " - "
      }
      result += point.x + "," + point.y
    }
    return result
  }

  static Empty = new Path([])
}

function pathIndexes(paths:Path[]): number[] {
  let result : number[] = []
  for (var k in paths) {
    if (paths.hasOwnProperty(k)) {
      result.push(k)
    }
  }
  result.sort(function(a, b) { return a-b; })
  return result
}

// Accounts for negative indices
function pathValues(paths:Path[]) : Path[] {
  let result : Path[] = []
  for (var idx of pathIndexes(paths)) {
    result.push(paths[idx])
  }
  return result
}

class Tag {
  constructor(top:boolean, down:boolean) {}
  down:boolean = false
  top:boolean = false

  static Top = new Tag(true, false)
  static Down = new Tag(false, true)
}

class TaggedChar {
  constructor(public char:string, public tag:Tag) {}
}

class TaggedString {
  public length:number
  constructor(public text:TaggedChar[]) {
    this.length = text.length
  }

  static make(text:string, tag:Tag):TaggedString {
    let tcs:TaggedChar[] = []
    for (let i = 0; i <= text.length; i++) {
      tcs.push(new TaggedChar(text[i], tag))
    }
    return new TaggedString(tcs)
  }

  at(offset:number):TaggedChar {
    assert(offset >= 0 && offset < this.length, "Offset out of bounds " + offset)
    return this.text[offset]
  }
}

class MyersState {
  pathCollection:Path[] = []
  path:Path = Path.Empty
  candidates:Line[] = []
  highlights:Line[] = []
  topLevel:boolean = true
  diagonal:number

  constructor(diagonal:number) {
    this.diagonal = diagonal
  }

  static EmptyState() {
    return new MyersState(0)
  }
}

class MyersContext {
  public output:MyersState[] = []
  private left:TaggedString
  private top:TaggedString

  constructor(left:string, top:string) {
    this.left = TaggedString.make(left, Tag.Down)
    this.top = TaggedString.make(top, Tag.Top)
  }

  pushState(diagonal:number):MyersState {
    let result = new MyersState(diagonal)
    this.output.push(result)
    return result
  }

  // Remove any points outside of our range
  trim1Path(path:Path): Path {
    let result = Path.Empty.copy()
    for (let point of path.points) {
      if (point.x < this.top.length && point.y < this.left.length) {
        result.points.push(point)
      }
    }
    return result
  }

  trimPaths(paths:Path[]): Path[] {
    let result : Path[] = []
    for (var idx of pathIndexes(paths)) {
      result[idx] = this.trim1Path(paths[idx])
    }
    return result
  }


  // Single directional myers diff algorithm
  unidir() {
    const tthis = this // workaround https://github.com/Microsoft/TypeScript/issues/6021
    let endpoints:Path[] = []
    endpoints[1] = new Path([{x:0, y:-1}])

    let topLen = tthis.top.length
    let downLen = tthis.left.length
    let MAX = topLen + downLen
    let done = false

    for (let step=0; step <= MAX && ! done; step++) {
      for (let diagonal = -step; diagonal <= step; diagonal+=2) {

        let getLine = (where:Point, down:boolean):Line => {
          // if down is true, we are starting from the diagonal above us, which is larger
          // if down is false, we are starting from the diagonal to our left, which is smaller
          let otherDiagonal = diagonal + (down ? 1 : -1)
          let startX = x - (down ? 0 : 1)
          let startY = startX - otherDiagonal
          let start = {x:startX, y:startY}
          let end = {x:startX + (down ? 0 : 1), y:startY + (down ? 1 : 0)}
          return new Line(start, end)
        }

        // Whether we traverse down (y+1) or right (x+1)
        let goDown: boolean
        let bestPath: Path

        let candidateLines:Line[] = []
        if (diagonal == -step) {
            let top = endpoints[diagonal+1]
            goDown = true
            bestPath = top
            candidateLines.push(getLine(top.end(), goDown))
        } else if (diagonal == step) {
            let left = endpoints[diagonal-1]
            goDown = false
            bestPath = left
            candidateLines.push(getLine(moved(left.end(), 1), goDown))
        } else {
            let left = endpoints[diagonal-1], top = endpoints[diagonal+1]
            goDown = left.end().x < top.end().x
            bestPath = goDown ? top : left
            candidateLines.push(getLine(top.end(), true), getLine(moved(left.end(), 1), false))
        }

        // go down or right
        let x:number = goDown ? endpoints[diagonal + 1].end().x : endpoints[diagonal - 1].end().x + 1
        let y:number = x - diagonal

        assert(isFinite(x) && isFinite(y), "Internal error: non-finite values " + x + " / " + y)
        assert(x >= 0 && y >= 0, "Internal error: negative values " + x + " / " + y)

        // Skip cases that go off the grid
        // Note we check >, not >=, because we have a terminating dots at x == top_len / y == down_len
        if (x > topLen || y > downLen) {
            continue
        }

        // TODO: update tagged string

        let highlightLines:Line[] = []
        highlightLines.push(Line.make(x - (goDown ? 0 : 1), y - (goDown ? 1 : 0), x, y))

        var cursorPath = bestPath.plus({x:x, y:y})

        let state = tthis.pushState(diagonal)
        state.pathCollection = tthis.trimPaths(endpoints)
        state.path = tthis.trim1Path(cursorPath)
        state.candidates = candidateLines
        state.highlights = highlightLines

        // Traverse the snake
        while (x < topLen && y < downLen && tthis.top.at(x).char == tthis.left.at(y).char) {
            x++, y++
            cursorPath = cursorPath.plus({x:x, y:y})
            // copy and update our tagged string
            // the character at index y-1 in our string is now shared
            // new_tagged_string = new_tagged_string.slice(0)
            // remove_tag(new_tagged_string, TAG_RECENT)
            // let idx = new_tagged_string.indexOf(down_tagged_string[y-1])
            // new_tagged_string[idx] = new_tagged_string[idx].retag(TAG_DOWN | TAG_TOP | TAG_RECENT)
            //
            highlightLines = highlightLines.concat([Line.make(x-1, y-1, x, y)])
            let state = tthis.pushState(diagonal)
            state.pathCollection = tthis.trimPaths(endpoints)
            state.path = tthis.trim1Path(cursorPath)
            state.candidates = candidateLines
            state.highlights = highlightLines
            state.topLevel = false

            if (x >= topLen && y >= downLen) {
                done = true
                break
            }
        }
        endpoints[diagonal] = cursorPath
        if (x >= topLen && y >= downLen) {
            done = true
            break
        }
      }
    }
  }
}

class MyersInput {
  constructor(public left:string, public top:string) {}
}

function MyersUnidir(input:MyersInput) : MyersState[] {
  let ctx = new MyersContext(input.left, input.top)
  console.log("ctx: " + ctx)
  ctx.unidir()
  return ctx.output
}
