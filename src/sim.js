'use strict';

import dat from "dat.gui";
import lz4 from "lz4js";
import $ from "cash";
import "./style.css";
import colormapCode from "./colormap.glsl";
import previewCode from "./preview.glsl";
import vertexCode from "./vertex.glsl";
import simulateCode from "./simulate.glsl";
var resources = {
    "colormap": colormapCode,
    "preview": previewCode,
    "vertex": vertexCode,
    "simulate": simulateCode
};

const canvas = document.getElementById("glCanvas");
const gl = canvas.getContext("webgl2");
const blending = gl.NEAREST;
const edgeBehavior = gl.REPEAT;
const viewerCanvas = document.getElementById("glViewer");
const glViewer = viewerCanvas.getContext("webgl2");

/* Global Variables */
var flip = false;                           // Framebuffer flip
var simProgram;                             // The GL shader program for simulation (see simulate.glsl)
var colorProgram;                           // The GL shader program for colormapping (see colormap.glsl)
var previewProgram;                         // The GL shader program for previewing (see preview.glsl)
var simUniforms;                            // Fragment shader uniform map for simulation shader
var colorUniforms;                          // Fragment shader uniform map for colormapping shader
var previewUniforms;                        // Fragment shader uniform map for colormapping shader
var previewTex;                             // Texture ID for texture preview
var texB;                                   // Framebuffer B GL texture ID
var texA;                                   // Framebuffer A GL texture ID
var ruleTex;                                // Cellular automata rule GL texture ID
var binomialTex;                            // Precomputed binomial coefficients GL texture ID
var colorMapTex;                            // State to color GL texture ID
var fbA;                                    // Framebuffer A ID
var fbB;                                    // Framebuffer B ID
var gui;                                    // datgui object
var touchID;                                // For identifying touch events
var ruleData = new Uint8Array(1024 * 1024); // The actual CA rule data
var nStates = 2;                            // Number of states in the CA rule

// Simulation parameters for datgui
const parameters = {
    clear: clear,
    step: step,
    newRule: () => { setRule(randomRule(nStates)); },
    customRule: () => { alert("not implemented"); },
    mutate: mutate,
    germinate: () => {
        // Clear with a single spot in the center
        clear();
        let data = new Uint8Array(canvas.width * canvas.height * 3);
        let i = (canvas.width * (canvas.height / 2)) * 3;
        data[i] = 1;
        webGlSetup(data);
    },
    fillRandom: () => {
        // Clear with a single spot in the center
        clear();
        let data = new Uint8Array(canvas.width * canvas.height * 3);
        for (let i = 0; i < data.length / 3; i++) {
            data[i * 3] = Math.round(Math.random());
        }
        webGlSetup(data);
    },
    nStates: 2,
    penSize: 50.0,
    pause: false,
    scale: 2,
    preset: "gol"
};
// Preset rules
const presets = {
    gol:           [0,0,0,1,0,0,0,0,0,
                    0,0,1,1,0,0,0,0,0],
    worms:         [0,1,0,0,0,1,0,1,1,
                    0,0,0,0,1,1,1,1,1],
    maze:          [1,1,0,1,0,0,0,0,1,
                    1,0,1,1,1,0,1,1,0],
    boxes:         [1,1,0,1,0,0,0,1,1,
                    0,1,1,1,0,1,0,0,1],
    hilbert:       [0,1,0,0,0,0,0,0,0,
                    0,1,1,1,1,1,1,1,1],
    snakes:        [0,1,1,1,1,1,1,1,1,
                    1,1,0,0,1,1,1,0,0],
    stars:         [0,0,1,1,0,0,1,1,0,
                    0,0,1,1,0,1,1,1,1],
    nicetiles:     [1,1,1,0,0,0,0,0,1,
                    0,1,1,1,0,1,0,0,1],
    tricircuit:    [1,1,1,0,0,0,0,0,1,
                    0,1,1,1,1,1,0,0,1],
    sierpinski1:   [0,1,0,0,0,0,0,0,0,
                    0,1,1,0,1,1,1,1,1],
    machine:       [0,1,0,0,0,0,0,0,1,
                    1,1,1,1,0,0,0,1,0],
    tearing:       [0,0,0,0,1,1,1,1,1,
                    0,0,0,1,0,1,1,0,1],
    complexmaze:   [0,0,0,1,0,0,0,0,0,
                    0,0,1,1,1,1,0,1,0],
    gooeyzebra:    [1,1,1,0,1,1,0,1,1,
                    1,1,1,1,0,0,0,0,0],
    octofractal:   [1,0,0,0,0,1,0,1,1,
                    1,1,1,1,0,0,0,1,0],
    sierpinski2:   [1,1,0,0,0,0,0,0,1,
                    1,0,1,1,1,0,1,1,0]
};
// Mapping from rule length to number of states
var nStateMap = {};
// State number to color
const colorMap = new Uint8Array([
    /* 0  */ 0, 0, 0,
    /* 1  */ 255, 255, 255,
    /* 2  */ 255, 50, 50,
    /* 3  */ 50, 255, 50,
    /* 4  */ 50, 50, 255,
    /* 5  */ 255, 255, 50,
    /* 6  */ 50, 255, 255,
    /* 7  */ 255, 50, 255,
    /* 8  */ 255, 50, 175,
    /* 9  */ 50, 255, 175,
    /* 10 */ 175, 50, 255,
    /* 11 */ 255, 255, 175,
    /* 12 */ 175, 255, 50,
    /* 13 */ 50, 175, 255
]);

function mouseHandler(e) {
    simUniforms.mouse.val[0] = ((Math.floor(e.pageX)) / window.innerWidth);
    simUniforms.mouse.val[1] = ((Math.floor(e.pageY)) / window.innerHeight);
}

function clickOn(e) {
    simUniforms.mouse.val[2] = e.originalEvent.button;
}

function clickOff(e) {
    simUniforms.mouse.val[2] = -1;
}

function onPenSize() {
    simUniforms.mouse.val[3] = parameters.penSize;
}

//Render to the screen
function animateScene() {
    gl.viewport(0, 0, canvas.width, canvas.height);

    /* Simulation */
    gl.useProgram(simProgram);
    //Set simUniforms
    gl.uniform1f(simUniforms.width.loc, canvas.width);
    gl.uniform1f(simUniforms.height.loc, canvas.height);
    gl.uniform1i(simUniforms.sampler.loc, 0);
    gl.uniform1i(simUniforms.rule.loc, 1);
    gl.uniform1i(simUniforms.binomial.loc, 2);
    gl.uniform4fv(simUniforms.mouse.loc, simUniforms.mouse.val);
    gl.uniform1i(simUniforms.states.loc, simUniforms.states.val);
    gl.uniform1i(simUniforms.subindices.loc, simUniforms.subindices.val);
    //Simulate and render to framebuffer
    gl.bindFramebuffer(gl.FRAMEBUFFER, flip ? fbB : fbA);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, flip ? texA : texB);
    gl.activeTexture(gl.TEXTURE1);
    gl.bindTexture(gl.TEXTURE_2D, ruleTex);
    gl.activeTexture(gl.TEXTURE2);
    gl.bindTexture(gl.TEXTURE_2D, binomialTex);
    gl.drawArrays(gl.TRIANGLES, 0, 6);

    /* Colormapping */
    gl.useProgram(colorProgram);
    //Colormap uniforms
    gl.uniform1i(colorUniforms.sampler.loc, 0);
    gl.uniform1i(colorUniforms.colormap.loc, 1);
    //Colormap and render to canvas
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, flip ? texA : texB);
    gl.activeTexture(gl.TEXTURE1);
    gl.bindTexture(gl.TEXTURE_2D, colorMapTex);
    gl.drawArrays(gl.TRIANGLES, 0, 6);

    /* Debug Preview */
    glViewer.drawArrays(glViewer.TRIANGLES, 0, 6);

    //Flip framebuffers
    flip = !flip;
    if (!parameters.pause) window.requestAnimationFrame(animateScene);
}

//Random rule
function randomRule(nStates) {
    let length = ruleLength(nStates);
    let rule = new Uint8Array(length);
    for (let i = 0; i < length; i++) {
        rule[i] = Math.floor(Math.random() * nStates);
    }
    return rule;
}

//Set rule
function setRule(rule) {
    //Check if rule is valid
    if (!rule || nStateMap[rule.length] === undefined) {
        alert("invalid rule!");
        return;
    }
    nStates = nStateMap[rule.length];
    ruleData.set(rule);
    regenRuleTex();

    let ruleString = exportRule(rule);
    console.info(`rule: [${ruleString}]`);
    $("#info").text(`rule: [${ruleString}]`);
}

//Regenerate rule texture from current rule data
function regenRuleTex() {
    //Rule texture
    ruleTex = ruleTex || gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, ruleTex);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.LUMINANCE, 1024, 1024, 0, gl.LUMINANCE, gl.UNSIGNED_BYTE, ruleData);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, blending);
}

//Factorial function
function factorial(m) {
    let n = 1;
    for (let i = 2; i <= m; i++) {
        n *= i;
    }
    return n;
}

//Binomial coefficient function
function binomial(n, k) {
    return Math.floor(factorial(n) / (factorial(k) * factorial(n - k)));
}

//Build precomputed binomial coefficient texture
function buildBinomial() {
    console.info("Building binomial coefficient tex...");
    let data = new Uint8Array(32 * 32 * 4);
    data.fill(0);
    for (let n = 0; n < 32; n++) {
        for (let k = 0; k < 32; k++) {
            let value = binomial(n, k);
            let index = (k * 32 + n) * 4;
            //Pack result into the four RGBA bytes
            data[index + 0] = value & 0xFF;
            data[index + 1] = (value >> 8) & 0xFF;
            data[index + 2] = (value >> 16) & 0xFF;
            data[index + 3] = (value >> 24) & 0xFF;
        }
    }
    binomialTex = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, binomialTex);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, 32, 32, 0, gl.RGBA, gl.UNSIGNED_BYTE, data);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, blending);

    previewTex = glViewer.createTexture();
    glViewer.bindTexture(glViewer.TEXTURE_2D, previewTex);
    glViewer.texImage2D(glViewer.TEXTURE_2D, 0, glViewer.RGBA, 32, 32, 0, glViewer.RGBA, glViewer.UNSIGNED_BYTE, data);
    glViewer.texParameteri(glViewer.TEXTURE_2D, glViewer.TEXTURE_WRAP_S, glViewer.CLAMP_TO_EDGE);
    glViewer.texParameteri(glViewer.TEXTURE_2D, glViewer.TEXTURE_WRAP_T, glViewer.CLAMP_TO_EDGE);
    glViewer.texParameteri(glViewer.TEXTURE_2D, glViewer.TEXTURE_MIN_FILTER, blending);
}

//Returns 1D rule subindex given number of states and neighbor count array
function ruleSubIndex(nStates, neighbors) {
    let subIndex = 0;
    let x = nStates;
    let y = 8;
    for (let i = 0; i < nStates - 1; i++) {
        let v = neighbors[i];
        if (v > 0) {
            subIndex += binomial(y + x - 1, x - 1) - binomial(y - v + x - 1, x - 1);
        }
        x -= 1;
        y -= cc;
    }
    return subIndex;
}

//Returns the number of rule patterns (length of the rule)
function ruleLength(nStates) {
   return nStates * ruleSubIndices(nStates);
}

//Returns the number of rule subindices (pattern permutations)
function ruleSubIndices(nStates) {
   return binomial(nStates + 8 - 1, nStates - 1);
}

//Exports rule to unicode string
function exportRule(rule) {
    console.debug(`exporting rule length ${rule.length}`);
    let string = `${nStateMap[rule.length]}_`;
    for (let i = 0; i < rule.length; i += 4) {
        let code = 32;
        for (let j = 0; j < 4 && i + j < rule.length; j++) {
            code += rule[i + j] << (j * 4);
        }
        string += String.fromCharCode(code);
    }
    return string;
}

//Imports rule from unicode string directly into current rule buffer, setting rule to given
function importRule(string) {
    nStates = parseInt(string.split("_")[0]);
    console.assert(nStates > 1 && nStates < 14, "importRule: incorrect rule length!");
    let length = ruleLength(nStates);
    let i = 0;
    console.debug(`importing rule length ${length}`);
    string = string.slice(string.indexOf("_") + 1);
    for (let char of string) {
        let code = char.charCodeAt(0) - 32;
        for (let j = 0; j < 4 && i < length; j++) {
            let value = (code >> j * 4) & 0xF;
            console.assert(value < nStates, "importRule: rule is invalid!");
            ruleData[i] = value;
            i += 1;
        }
    }
    regenRuleTex();
}

//Setup for WebGL stuff
function webGlSetup(data) {
    //Texture A
    texA = texA || gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, texA);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGB, 
        canvas.width,
        canvas.height,
        0, gl.RGB, gl.UNSIGNED_BYTE, data || null
    );
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, edgeBehavior);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, edgeBehavior);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, blending);
    //Framebuffer A
    fbA = fbA || gl.createFramebuffer();
    gl.bindFramebuffer(gl.FRAMEBUFFER, fbA);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, texA, 0);
    //Texture B
    texB = texB || gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, texB);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGB, 
        canvas.width,
        canvas.height,
        0, gl.RGB, gl.UNSIGNED_BYTE, data || null
    );
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, edgeBehavior);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, edgeBehavior);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, blending);
    //Framebuffer B
    fbB = fbB || gl.createFramebuffer();
    gl.bindFramebuffer(gl.FRAMEBUFFER, fbB);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, texB, 0);

    //Build simulator shader program
    if (!simProgram) {
        const shaderSet = [
            {type: gl.FRAGMENT_SHADER, name: "simulate"},
            {type: gl.VERTEX_SHADER, name: "vertex"}
        ];
        simProgram = buildShaderProgram(gl, shaderSet);
        gl.useProgram(simProgram);

        //Build precomputed binomial coefficient texture
        buildBinomial();
    
        //Create vertices for quad
        let vertexArray = new Float32Array([
            -1.0, 1.0, 1.0, 1.0, 1.0, -1.0,
            -1.0, 1.0, 1.0, -1.0, -1.0, -1.0
        ]);
        let vertexBuffer = gl.createBuffer();
        gl.bindBuffer(gl.ARRAY_BUFFER, vertexBuffer);
        gl.bufferData(gl.ARRAY_BUFFER, vertexArray, gl.STATIC_DRAW);
    
        //Uniforms
        simUniforms = {
            width:      {loc: gl.getUniformLocation(simProgram, "uWidth")},
            height:     {loc: gl.getUniformLocation(simProgram, "uHeight")},
            sampler:    {loc: gl.getUniformLocation(simProgram, "uSampler")},
            binomial:   {loc: gl.getUniformLocation(simProgram, "uBinomial")},
            rule:       {loc: gl.getUniformLocation(simProgram, "uRule")},
            mouse:      {loc: gl.getUniformLocation(simProgram, "uMouse"), val: [0, 0, -1, 50]},
            states:     {loc: gl.getUniformLocation(simProgram, "uStates"), val: 2},
            subindices: {loc: gl.getUniformLocation(simProgram, "uSubIndices"), val: binomial(2 + 8 - 1, 2 - 1)}
        };
    
        //Attributes
        let aVertexPosition = gl.getAttribLocation(simProgram, "aVertexPosition");
        gl.activeTexture(gl.TEXTURE0);
        gl.vertexAttribPointer(aVertexPosition, 2, gl.FLOAT, false, 0, 0);
        gl.enableVertexAttribArray(aVertexPosition);

        //Rule texture
        setRule(presets[parameters.preset]);
    }

    // Build colormap shader program
    if (!colorProgram) {
        const shaderSet = [
            {type: gl.FRAGMENT_SHADER, name: "colormap"},
            {type: gl.VERTEX_SHADER, name: "vertex"}
        ];
        colorProgram = buildShaderProgram(gl, shaderSet);
        gl.useProgram(colorProgram);

        //Color map
        colorMapTex = gl.createTexture();
        gl.bindTexture(gl.TEXTURE_2D, colorMapTex);
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGB, 14, 1, 0, gl.RGB, gl.UNSIGNED_BYTE, colorMap);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, blending);
    
        //Create vertices for quad
        let vertexArray = new Float32Array([
            -1.0, 1.0, 1.0, 1.0, 1.0, -1.0,
            -1.0, 1.0, 1.0, -1.0, -1.0, -1.0
        ]);
        let vertexBuffer = gl.createBuffer();
        gl.bindBuffer(gl.ARRAY_BUFFER, vertexBuffer);
        gl.bufferData(gl.ARRAY_BUFFER, vertexArray, gl.STATIC_DRAW);
    
        //Uniforms
        colorUniforms = {
            sampler:    {loc: gl.getUniformLocation(colorProgram, "uSampler")},
            colormap:   {loc: gl.getUniformLocation(colorProgram, "uColorMap")}
        };
    
        //Attributes
        let aVertexPosition = gl.getAttribLocation(colorProgram, "aVertexPosition");
        gl.activeTexture(gl.TEXTURE0);
        gl.vertexAttribPointer(aVertexPosition, 2, gl.FLOAT, false, 0, 0);
        gl.enableVertexAttribArray(aVertexPosition);
    }

    // Build texture preview shader program
    if (!previewProgram) {
        const shaderSet = [
            {type: glViewer.FRAGMENT_SHADER, name: "preview"},
            {type: glViewer.VERTEX_SHADER, name: "vertex"}
        ];
        previewProgram = buildShaderProgram(glViewer, shaderSet);
        glViewer.useProgram(previewProgram);
    
        //Create vertices for quad
        let vertexArray = new Float32Array([
            -1.0, 1.0, 1.0, 1.0, 1.0, -1.0,
            -1.0, 1.0, 1.0, -1.0, -1.0, -1.0
        ]);
        let vertexBuffer = glViewer.createBuffer();
        glViewer.bindBuffer(glViewer.ARRAY_BUFFER, vertexBuffer);
        glViewer.bufferData(glViewer.ARRAY_BUFFER, vertexArray, glViewer.STATIC_DRAW);
    
        //Uniforms
        previewUniforms = {
            sampler:    {loc: glViewer.getUniformLocation(previewProgram, "uSampler")}
        };
    
        //Attributes
        let aVertexPosition = glViewer.getAttribLocation(previewProgram, "aVertexPosition");
        glViewer.activeTexture(glViewer.TEXTURE0);
        glViewer.vertexAttribPointer(aVertexPosition, 2, glViewer.FLOAT, false, 0, 0);
        glViewer.enableVertexAttribArray(aVertexPosition);


        glViewer.uniform1i(previewUniforms.sampler.loc, 0);
        glViewer.activeTexture(glViewer.TEXTURE0);
        glViewer.bindTexture(glViewer.TEXTURE_2D, previewTex);
    }
}

//Main function, is called after all resources are loaded
function main() {
    //Check if WebGL2 is available
    if (gl == null) {
        alert("Unable to initialize WebGL 2 context");
        return;
    }
    //Build nstate map
    for (let i = 2; i <= 14; i++) {
        nStateMap[ruleLength(i)] = i;
    }

    //Texture data
    parameters.fillRandom();

    //Handlers
    $(canvas).on("mousemove", mouseHandler);
    $(canvas).on("mousedown", clickOn);
    $(canvas).on("mouseup", clickOff);
    $(window).on("resize", resize);

    //Mouse emulation with touch
    $(canvas).on("touchstart", (e) => {
        touchID = e.originalEvent.touches.item(0).identifier;
        clickOn({originalEvent: {button: 0}});
    });
    $(canvas).on("touchend", (e) => {
        clickOff();
    });
    $(canvas).on("touchmove", (e) => {
        let touch = e.originalEvent.touches.item(0);
        mouseHandler({pageX: touch.pageX, pageY: touch.pageY});
        console.log(e);
    });

    animateScene();
}

//Compile a shader from given code and gl shader type
function compileShader(glc, name, code, type) {
    let shader = glc.createShader(type);
  
    glc.shaderSource(shader, code);
    glc.compileShader(shader);
  
    if (!glc.getShaderParameter(shader, glc.COMPILE_STATUS)) {
        console.error(`Error compiling ${type === glc.VERTEX_SHADER ? "vertex" : "fragment"} shader "${name}":`);
        console.log(glc.getShaderInfoLog(shader));
    }
    return shader;
}

//Build the shader program from given shader informations
function buildShaderProgram(glc, shaderInfo) {
    let program = glc.createProgram();

    shaderInfo.forEach(function(sInfo) {
        let shader = compileShader(glc, sInfo.name, resources[sInfo.name], sInfo.type);

        if (shader) {
            glc.attachShader(program, shader);
        }
    });

    glc.linkProgram(program)

    if (!glc.getProgramParameter(program, glc.LINK_STATUS)) {
        console.error("Error linking shader program:");
        console.info(glc.getProgramInfoLog(program));
    }

    return program;
}

//Restart
function clear() {
    flip = false;
    if (fbA && fbB) {
        gl.bindFramebuffer(gl.FRAMEBUFFER, fbA);
        gl.clearColor(0, 0, 0, 1.0);
        gl.clear(gl.COLOR_BUFFER_BIT);
        gl.bindFramebuffer(gl.FRAMEBUFFER, fbB);
        gl.clearColor(0, 0, 0, 1.0);
        gl.clear(gl.COLOR_BUFFER_BIT);
    }
}

//Resize
function resize(e) {
    clear();
    canvas.width = window.innerWidth / parameters.scale;
    canvas.height = window.innerHeight / parameters.scale;
    webGlSetup();
}

//Single step
function step() {
    parameters.pause = true;
    animateScene();
}

//Mutate current rule
function mutate() {
    let mRule = ruleData.slice(0, ruleLength(nStates));
    let i = Math.floor(Math.random() * mRule.length);
    mRule[i] = Math.floor(Math.random() * nStates);
    setRule(mRule);
}

//GUI
gui = new dat.GUI();
gui.width = 350;
gui.add(parameters, "penSize", 1.0, 200.0)
    .onChange(onPenSize)
    .name("pen size");
gui.add(parameters, "scale", 1, 8)
    .onChange(resize).step(1);
gui.add(parameters, "pause")
    .listen()
    .onChange(() => {if (!parameters.pause) animateScene();});
gui.add(parameters, "step");
gui.add(parameters, "nStates").name("# states")
    .onChange(() => {
        if (parameters.nStates >= 2 && parameters.nStates < 14) {
            nStates = parameters.nStates;
            setRule(randomRule(nStates));
        } else {
            parameters.nStates = nStates;
        }
    });
gui.add(parameters, "preset", Object.keys(presets))
    .onChange(() => setRule(presets[parameters.preset]));
gui.add(parameters, "newRule").name("random rule");
gui.add(parameters, "customRule").name("custom rule");
gui.add(parameters, "mutate").name("mutate rule");
gui.add(parameters, "clear");
gui.add(parameters, "germinate").name("germinate from center");
gui.add(parameters, "fillRandom").name("fill randomly");

//Load resources
canvas.width = window.innerWidth / parameters.scale;
canvas.height = window.innerHeight / parameters.scale;
console.debug(colormapCode, previewCode, vertexCode, simulateCode);

main();