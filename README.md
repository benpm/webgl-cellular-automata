![banner](banner.gif)

# WebGL Cellular Automata
Multi-state 8-neighbor [totalistic](https://www.wikiwand.com/en/Cellular_automaton#/Totalistic) 2D cellular automata simulation written in WebGL, with support for random rule generation. The simulation takes place in a single GLSL fragment shader. Rules are stored in a very compact way, passed as a texture. Writeup on how this is done is coming!

[*Play with it here!*](https://benpm.github.io/webgl-cellular-automata)

## Controls
### Interaction
- *Left click* to draw cells
- *Right click* to draw state 0 cells (black)
- *Arrow keys* or *middle click* to pan
- *Scroll wheel* to zoom
### Parameters (+ Keyboard Shorcuts)
- **pen size**: Radius of drawing circle in pixels
- **pen state** (<kbd>1</kbd>,<kbd>2</kbd>,<kbd>3</kbd>...): Cell type to draw with
- **pause** (<kbd>spacebar</kbd>): Pauses simulation
- **step** (<kbd>S</kbd>): Pauses, advances simulation by a single step
- **steps per frame**: Number of simulation steps attempted per rendered frame
- **# states**: Interprets rule with this number of states (changing will require new rule)
- **preset**: Various preset rules
- **random rule** (<kbd>R</kbd>): Generates random rule
- **import rule from clipboard**: Imports compressed rule from clipboard text
- **export rule to clipboard**: Exports compressed rule as text to clipboard
- **rule from text**: Interprets input text as a rule (not the same as import)
- **mutate rule** (<kbd>M</kbd>): Randomly changes some rule parameters
- **simulation size**: Size of the simulation texture
- **clear** (<kbd>C</kbd>): Sets state of entire simulation space to 0
- **germinate from center** (<kbd>G</kbd>): Adds single state-1 cell to center, clearing everything else
- **fill randomly** (<kbd>F</kbd>): Sets all cells to random states

![banner2](banner2.gif)

## Scope
Totalistic 2D automata are a set of automata that include Conway's Game of Life, Wireworld, Brian's Brain, and more, which will be added as presets soon. Help me find new interesting rules to include in the presets!

## How it Works
*Coming soon!*
