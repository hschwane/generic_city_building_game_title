
var roomCode = null;
var myUser;

var SCREEN_MODE_DISCONNECTED = 0;
var SCREEN_MODE_LOGIN = 1;
var SCREEN_MODE_WAITING_FOR_SERVER_CONNECT = 2;
var SCREEN_MODE_WAITING_FOR_CREATE_ROOM = 3;
var SCREEN_MODE_WAITING_FOR_ROOM_CODE_CONFIRMATION = 4;
var SCREEN_MODE_PLAY = 5;
var screenMode = SCREEN_MODE_LOGIN;

document.getElementById("createRoomButton").addEventListener("click", function() {
  roomCode = null;
  connectToServer();
});
document.getElementById("roomCodeTextbox").addEventListener("keydown", function(event) {
  event.stopPropagation();
  if (event.keyCode === 13) {
    setTimeout(submitRoomCode, 0);
  } else {
    setTimeout(function() {
      var textbox = document.getElementById("roomCodeTextbox");
      var value = textbox.value;
      var canonicalValue = value.toUpperCase();
      if (value === canonicalValue) return;
      var selectionStart = textbox.selectionStart;
      var selectionEnd = textbox.selectionEnd;
      textbox.value = canonicalValue;
      textbox.selectionStart = selectionStart;
      textbox.selectionEnd = selectionEnd;
    }, 0);
  }
});
document.getElementById("joinRoomButton").addEventListener("click", submitRoomCode);
function submitRoomCode() {
  roomCode = document.getElementById("roomCodeTextbox").value;
  connectToServer();
}

function setScreenMode(newMode) {
  screenMode = newMode;
  var loadingMessage = null;
  var activeDivId = (function() {
    switch (screenMode) {
      case SCREEN_MODE_PLAY: return "roomDiv";
      case SCREEN_MODE_LOGIN: return "loginDiv";
      case SCREEN_MODE_DISCONNECTED:
        loadingMessage = "Disconnected...";
        return "loadingDiv";
      case SCREEN_MODE_WAITING_FOR_SERVER_CONNECT:
        loadingMessage = "Trying to reach the server...";
        return "loadingDiv";
      case SCREEN_MODE_WAITING_FOR_CREATE_ROOM:
        loadingMessage = "Waiting for a new room...";
        return "loadingDiv";
      case SCREEN_MODE_WAITING_FOR_ROOM_CODE_CONFIRMATION:
        loadingMessage = "Checking room code...";
        return "loadingDiv";
      default: throw asdf;
    }
  })();
  ["roomDiv", "loginDiv", "loadingDiv"].forEach(function(divId) {
    setDivVisible(document.getElementById(divId), divId === activeDivId);
  });
  if (activeDivId === "loginDiv") document.getElementById("roomCodeTextbox").focus();
  document.getElementById("loadingMessageDiv").textContent = loadingMessage != null ? loadingMessage : "Please wait...";
}

var tableDiv = document.getElementById("tableDiv");

var usersById = {};

var facePathToUrlUrl = {
  //"face1.png": "", // loading...
  //"face2.png": 'url("face2.png")',
  //"face3.png#0,0,32,32": 'url("data://...")',
};

var gameDefinition;
var objectsById;
var objectsWithSnapZones; // cache
var changeHistory;
var futureChanges;
function initGame(game, history) {
  gameDefinition = game;
  objectsById = {};
  objectsWithSnapZones = [];
  changeHistory = [];
  futureChanges = [];
  for (var id in gameDefinition.objects) {
    if (gameDefinition.objects[id].prototype) continue;
    var objectDefinition = getObjectDefinition(id);
    if (objectDefinition.faces != null) objectDefinition.faces.forEach(preloadImagePath);
    var object = {
      id: id,
      x: objectDefinition.x,
      y: objectDefinition.y,
      z: objectDefinition.z || 0,
      width: objectDefinition.width,
      height: objectDefinition.height,
      faces: objectDefinition.faces,
      snapZones: objectDefinition.snapZones || [],
      locked: !!objectDefinition.locked,
      faceIndex: 0,
    };
    objectsById[id] = object;
    if (object.snapZones.length > 0) objectsWithSnapZones.push(object);

    tableDiv.insertAdjacentHTML("beforeend",
      '<div id="object-'+id+'" data-id="'+id+'" class="gameObject" style="display:none;">' +
        '<div id="stackHeight-'+id+'" class="stackHeight" style="display:none;"></div>' +
      '</div>'
    );
    var objectDiv = getObjectDiv(object.id);
    objectDiv.addEventListener("mousedown", onObjectMouseDown);
    objectDiv.addEventListener("mousemove", onObjectMouseMove);
    objectDiv.addEventListener("mouseout", onObjectMouseOut);
  }
  // reassign all the z's to be unique
  var objects = getObjects();
  objects.sort(compareZ);
  objects.forEach(function(object, i) {
    object.z = i;
  });

  // replay history
  history.forEach(function(move) {
    makeAMove(move, false);
  });

  document.getElementById("roomCodeSpan").textContent = roomCode;

  checkForDoneLoading();
}
function getObjectDefinition(id) {
  // resolve prototypes
  var result = {};
  recurse(id, 0);
  return result;

  function recurse(id, depth) {
    var definition = gameDefinition.objects[id];
    for (var property in definition) {
      if (property === "prototypes") continue; // special handling
      if (property === "prototype" && depth !== 0) continue;  // don't inherit this property
      if (property in result) continue; // shadowed
      var value = definition[property];
      if (property === "front") {
        if (result.faces == null) result.faces = [];
        result.faces[0] = value;
      } else if (property === "back") {
        if (result.faces == null) result.faces = [];
        result.faces[1] = value;
      } else {
        result[property] = value;
      }
    }
    if (definition.prototypes != null) {
      definition.prototypes.forEach(function(id) {
        recurse(id, depth + 1);
      });
    }
  }
}
function preloadImagePath(path) {
  var url = facePathToUrlUrl[path];
  if (url != null) return; // already loaded or loading
  facePathToUrlUrl[path] = ""; // loading...
  var img = new Image();
  var hashIndex = path.indexOf("#");
  if (hashIndex !== -1) {
    var cropInfo = path.substring(hashIndex + 1).split(",");
    if (cropInfo.length !== 4) throw new Error("malformed url: " + path);
    img.src = path.substring(0, hashIndex);
  } else {
    img.src = path;
  }
  img.addEventListener("load", function() {
    if (cropInfo != null) {
      var x = parseInt(cropInfo[0], 10);
      var y = parseInt(cropInfo[1], 10);
      var width = parseInt(cropInfo[2], 10);
      var height = parseInt(cropInfo[3], 10);
      var canvas = document.createElement('canvas');
      canvas.width  = width;
      canvas.height = height;
      var context = canvas.getContext("2d");
      context.drawImage(img, x, y, width, height, 0, 0, width, height);
      facePathToUrlUrl[path] = 'url("'+canvas.toDataURL()+'")';
    } else {
      facePathToUrlUrl[path] = 'url("'+path+'")';
    }
    checkForDoneLoading();
  });
}
function checkForDoneLoading() {
  for (var key in facePathToUrlUrl) {
    if (facePathToUrlUrl[key] === "") return; // not done yet
  }
  // all done loading
  getObjects().forEach(render);
  renderOrder();
}

function deleteTableAndEverything() {
  tableDiv.innerHTML = "";
  gameDefinition = null;
  objectsById = null;
  usersById = {};
  selectedObjectIdToNewProps = {};
  // leave the image cache alone
}
function bringSelectionToTop() {
  // effectively do a stable sort.
  var selection = getEffectiveSelection();
  var z = findMaxZ(selection);
  var newPropses = [];
  for (var id in selection) {
    newPropses.push(selection[id]);
  }
  newPropses.sort(compareZ);
  newPropses.forEach(function(newProps, i) {
    newProps.z = z + i + 1;
  });
  renderAndMaybeCommitSelection(selection);
}
function findMaxZ(excludingSelection) {
  var z = null;
  getObjects().forEach(function(object) {
    if (excludingSelection != null && object.id in excludingSelection) return;
    if (z == null || object.z > z) z = object.z;
  });
  return z;
}

var DRAG_NONE = 0;
var DRAG_RECTANGLE_SELECT = 1;
var DRAG_MOVE_SELECTION = 2;
var draggingMode = DRAG_NONE;

var rectangleSelectStartX;
var rectangleSelectStartY;
var rectangleSelectEndX;
var rectangleSelectEndY;
var selectedObjectIdToNewProps = {};

var examiningObject = null;
var hoverObject;
var draggingMouseStartX;
var draggingMouseStartY;
function onObjectMouseDown(event) {
  if (event.button !== 0) return;
  if (examiningObject != null) return;
  var objectDiv = this;
  var object = objectsById[objectDiv.dataset.id];
  if (object.locked) return; // click thee behind me, satan
  event.preventDefault();
  event.stopPropagation();

  // select
  if (selectedObjectIdToNewProps[object.id] == null) {
    setSelectedObjects([object]);
  }

  // begin drag
  draggingMode = DRAG_MOVE_SELECTION;
  draggingMouseStartX = eventToMouseX(event, tableDiv);
  draggingMouseStartY = eventToMouseY(event, tableDiv);
  bringSelectionToTop();

  render(object);
  renderOrder();
}
function onObjectMouseMove(event) {
  if (draggingMode != DRAG_NONE) return;
  var objectDiv = this;
  var object = objectsById[objectDiv.dataset.id];
  if (object.locked) return;
  setHoverObject(object);
}
function onObjectMouseOut(event) {
  var objectDiv = this;
  var object = objectsById[objectDiv.dataset.id];
  if (hoverObject === object) {
    setHoverObject(null);
  }
}

tableDiv.addEventListener("mousedown", function(event) {
  if (event.button !== 0) return;
  // clicking the table
  event.preventDefault();
  if (examiningObject != null) return;
  draggingMode = DRAG_RECTANGLE_SELECT;
  rectangleSelectStartX = eventToMouseX(event, tableDiv);
  rectangleSelectStartY = eventToMouseY(event, tableDiv);
  setSelectedObjects([]);
});

document.addEventListener("mousemove", function(event) {
  var x = eventToMouseX(event, tableDiv);
  var y = eventToMouseY(event, tableDiv);
  if (draggingMode === DRAG_RECTANGLE_SELECT) {
    rectangleSelectEndX = x;
    rectangleSelectEndY = y;
    renderSelectionRectangle();
    (function() {
      var minX = (rectangleSelectStartX - gameDefinition.coordinates.originX) / gameDefinition.coordinates.unitWidth;
      var minY = (rectangleSelectStartY - gameDefinition.coordinates.originY) / gameDefinition.coordinates.unitHeight;
      var maxX = (rectangleSelectEndX   - gameDefinition.coordinates.originX) / gameDefinition.coordinates.unitWidth;
      var maxY = (rectangleSelectEndY   - gameDefinition.coordinates.originY) / gameDefinition.coordinates.unitHeight;
      if (minX > maxX) { var tmp = maxX; maxX = minX; minX = tmp; }
      if (minY > maxY) { var tmp = maxY; maxY = minY; minY = tmp; }
      var newSelectedObjects = [];
      getObjects().forEach(function(object) {
        if (object.locked) return;
        if (object.x > maxX) return;
        if (object.y > maxY) return;
        if (object.x + object.width  < minX) return;
        if (object.y + object.height < minY) return;
        newSelectedObjects.push(object);
      });
      setSelectedObjects(newSelectedObjects);
    })();
  } else if (draggingMode === DRAG_MOVE_SELECTION) {
    // pixels
    var dx = x - draggingMouseStartX;
    var dy = y - draggingMouseStartY;
    objectsWithSnapZones.sort(compareZ);
    Object.keys(selectedObjectIdToNewProps).forEach(function(id) {
      var object = objectsById[id];
      var newProps = selectedObjectIdToNewProps[id];
      // units
      var objectNewX = object.x + dx / gameDefinition.coordinates.unitWidth;
      var objectNewY = object.y + dy / gameDefinition.coordinates.unitHeight;
      // snap zones
      (function() {
        for (var i = objectsWithSnapZones.length - 1; i >= 0; i--) {
          var containerObject = objectsWithSnapZones[i];
          var containerRelativeX = objectNewX - containerObject.x;
          var containerRelativeY = objectNewY - containerObject.y;
          var containerObjectDefinition = getObjectDefinition(containerObject.id);
          for (var j = 0; j < containerObjectDefinition.snapZones.length; j++) {
            var snapZone = containerObjectDefinition.snapZones[j];
            var snapZoneRelativeX = containerRelativeX - snapZone.x;
            var snapZoneRelativeY = containerRelativeY - snapZone.y;
            if (snapZoneRelativeX < -1 || snapZoneRelativeX > snapZone.width)  continue; // way out of bounds
            if (snapZoneRelativeY < -1 || snapZoneRelativeY > snapZone.height) continue; // way out of bounds
            // this is the zone for us
            var roundedSnapZoneRelativeX = Math.round(snapZoneRelativeX);
            var roundedSnapZoneRelativeY = Math.round(snapZoneRelativeY);
            var inBoundsX = 0 <= roundedSnapZoneRelativeX && roundedSnapZoneRelativeX < snapZone.width;
            var inBoundsY = 0 <= roundedSnapZoneRelativeY && roundedSnapZoneRelativeY < snapZone.height;
            if (!inBoundsX && !inBoundsY) {
              // on an outside corner. we need to pick an edge to rub.
              if (Math.abs(roundedSnapZoneRelativeX - snapZoneRelativeX) > Math.abs(roundedSnapZoneRelativeY - snapZoneRelativeY)) {
                // x is further off
                inBoundsX = true;
              } else {
                // y is further off
                inBoundsY = true;
              }
            }
            if (inBoundsY) {
              objectNewX = roundedSnapZoneRelativeX + snapZone.x + containerObject.x;
            }
            if (inBoundsX) {
              objectNewY = roundedSnapZoneRelativeY + snapZone.y + containerObject.y;
            }
            return;
          }
        }
      })();
      if (!(newProps.x === objectNewX &&
            newProps.y === objectNewY)) {
        newProps.x = objectNewX;
        newProps.y = objectNewY;
        render(object);
      }
    });
    renderOrder();
  }
});
document.addEventListener("mouseup", function(event) {
  if (draggingMode === DRAG_RECTANGLE_SELECT) {
    draggingMode = DRAG_NONE;
    renderSelectionRectangle();
  } else if (draggingMode === DRAG_MOVE_SELECTION) {
    draggingMode = DRAG_NONE;
    commitSelection(selectedObjectIdToNewProps);
  }
});

function setHoverObject(object) {
  if (hoverObject == object) return;
  if (examiningObject != null) return;
  if (hoverObject != null) {
    getObjectDiv(hoverObject.id).classList.remove("hoverSelect");
  }
  hoverObject = object;
  if (hoverObject != null) {
    getObjectDiv(hoverObject.id).classList.add("hoverSelect");
  }
}
function setSelectedObjects(objects) {
  for (var id in selectedObjectIdToNewProps) {
    var objectDiv = getObjectDiv(id);
    objectDiv.classList.remove("selected");
  }
  selectedObjectIdToNewProps = {};
  objects.forEach(function(object) {
    selectedObjectIdToNewProps[object.id] = newPropsForObject(object);
  });
  for (var id in selectedObjectIdToNewProps) {
    var objectDiv = getObjectDiv(id);
    objectDiv.classList.add("selected");
  }

  if (hoverObject != null) {
    if (hoverObject.id in selectedObjectIdToNewProps) {
      // better than hovering
      getObjectDiv(hoverObject.id).classList.remove("hoverSelect");
    } else {
      // back to just hovering
      getObjectDiv(hoverObject.id).classList.add("hoverSelect");
    }
  }
}
function newPropsForObject(object) {
  return {
    x: object.x,
    y: object.y,
    z: object.z,
    faceIndex: object.faceIndex,
  };
}
function getEffectiveSelection(objects) {
  // if you make changes, call renderAndMaybeCommitSelection
  if (Object.keys(selectedObjectIdToNewProps).length > 0) return selectedObjectIdToNewProps;
  if (hoverObject != null) {
    var effectiveSelection = {};
    effectiveSelection[hoverObject.id] = newPropsForObject(hoverObject);
    return effectiveSelection;
  }
  return {};
}
function renderAndMaybeCommitSelection(selection) {
  var objectsToRender = [];
  // render
  for (var id in selection) {
    var object = objectsById[id];
    var newProps = selection[id];
    if (!(object.x === newProps.x &&
          object.y === newProps.y &&
          object.z === newProps.z &&
          object.faceIndex === newProps.faceIndex)) {
      objectsToRender.push(object);
    }
  }
  if (draggingMode === DRAG_NONE) {
    // if we're dragging, don't commit yet
    commitSelection(selection);
  }
  // now that we've possibly committed a temporary selection, we can render.
  objectsToRender.forEach(render);
  renderOrder();
}
function commitSelection(selection) {
  var move = [];
  move.push(myUser.id);
  for (var id in selection) {
    var object = objectsById[id];
    var newProps = selection[id];
    if (!(object.x === newProps.x &&
          object.y === newProps.y &&
          object.z === newProps.z &&
          object.faceIndex === newProps.faceIndex)) {
      move.push(
        object.id,
        object.x,
        object.y,
        object.z,
        object.faceIndex,
        newProps.x,
        newProps.y,
        newProps.z,
        newProps.faceIndex);
      // anticipate
      object.x = newProps.x;
      object.y = newProps.y;
      object.z = newProps.z;
      object.faceIndex = newProps.faceIndex;
    }
  }
  if (move.length <= 1) return;
  var message = {
    cmd: "makeAMove",
    args: move,
  };
  sendMessage(message);
  pushChangeToHistory(move);
}

var SHIFT = 1;
var CTRL = 2;
var ALT = 4;
function getModifierMask(event) {
  return (
    (event.shiftKey ? SHIFT : 0) |
    (event.ctrlKey ? CTRL : 0) |
    (event.altKey ? ALT : 0)
  );
}
document.addEventListener("keydown", function(event) {
  var modifierMask = getModifierMask(event);
  switch (event.keyCode) {
    case "R".charCodeAt(0):
      if (modifierMask === 0) { rollSelection(); break; }
      return;
    case "S".charCodeAt(0):
      if (modifierMask === 0) { shuffleSelection(); break; }
      return; 
    case "F".charCodeAt(0):
      if (modifierMask === 0) { flipOverSelection(); break; }
      return;
    case 27: // Escape
      if (draggingMode === DRAG_MOVE_SELECTION && modifierMask === 0) { cancelMove(); break; }
      if (draggingMode === DRAG_NONE && modifierMask === 0) { setSelectedObjects([]); break; }
      return;
    case "Z".charCodeAt(0):
      if (draggingMode === DRAG_NONE && modifierMask === CTRL)         { undo(); break; }
      if (draggingMode === DRAG_NONE && modifierMask === (CTRL|SHIFT)) { redo(); break; }
      if (modifierMask === 0) { examine(); break; }
      return;
    case "Y".charCodeAt(0):
      if (modifierMask === CTRL) { redo(); break; }
      return;
    default: return;
  }
  event.preventDefault();
});
document.addEventListener("keyup", function(event) {
  var modifierMask = getModifierMask(event);
  switch (event.keyCode) {
    case "Z".charCodeAt(0):
      unexamine();
      break;
    default: return;
  }
  event.preventDefault();
});

function flipOverSelection() {
  var selection = getEffectiveSelection();
  for (var id in selection) {
    var object = objectsById[id];
    var newProps = selection[id];
    newProps.faceIndex += 1;
    if (object.faces.length === newProps.faceIndex) {
      newProps.faceIndex = 0;
    }
  }
  renderAndMaybeCommitSelection(selection);
  renderOrder();
}
function rollSelection() {
  var selection = getEffectiveSelection();
  for (var id in selection) {
    var object = objectsById[id];
    var newProps = selection[id];
    newProps.faceIndex = Math.floor(Math.random() * object.faces.length);
  }
  renderAndMaybeCommitSelection(selection);
  renderOrder();
}
function cancelMove() {
  var selection = selectedObjectIdToNewProps;
  for (var id in selection) {
    var object = objectsById[id];
    var newProps = selection[id];
    newProps.x = object.x;
    newProps.y = object.y;
    newProps.z = object.z;
    newProps.faceIndex = object.faceIndex;
    render(object, true);
  }
  draggingMode = DRAG_NONE;
  renderOrder();
}
function shuffleSelection() {
  var selection;
  if (Object.keys(selectedObjectIdToNewProps).length > 0) {
    // real selection
    selection = selectedObjectIdToNewProps;
  } else if (hoverObject != null) {
    // select all objects we're hovering over in this stack
    var stackId = getStackId(hoverObject, hoverObject);
    selection = {};
    getObjects().forEach(function(object) {
      if (stackId !== getStackId(object, object)) return;
      selection[object.id] = newPropsForObject(object);
    });
  } else {
    // no selection
    return;
  }

  var newPropsArray = [];
  for (var id in selection) {
    newPropsArray.push(selection[id]);
  }
  for (var i = 0; i < newPropsArray.length; i++) {
    var otherIndex = Math.floor(Math.random() * (newPropsArray.length - i)) + i;
    var tempX = newPropsArray[i].x;
    var tempY = newPropsArray[i].y;
    var tempZ = newPropsArray[i].z;
    newPropsArray[i].x = newPropsArray[otherIndex].x;
    newPropsArray[i].y = newPropsArray[otherIndex].y;
    newPropsArray[i].z = newPropsArray[otherIndex].z;
    newPropsArray[otherIndex].x = tempX;
    newPropsArray[otherIndex].y = tempY;
    newPropsArray[otherIndex].z = tempZ;
  }
  renderAndMaybeCommitSelection(selection);
  renderOrder();
}
function examine() {
  if (examiningObject != null) return; // ignore key repeat
  if (hoverObject != null) {
    examiningObject = hoverObject;
  } else if (draggingMode === DRAG_MOVE_SELECTION) {
    var loneObject = null;
    for (var id in selectedObjectIdToNewProps) {
      if (loneObject != null) return; // too many objects selected
      loneObject = objectsById[id];
    }
    if (loneObject == null) throw asdf; // always dragging a selection
      examiningObject = loneObject;
  } else {
    return;
  }
  renderExaminingObject();
}
function unexamine() {
  if (examiningObject == null) return;
  var object = examiningObject;
  examiningObject = null;
  render(object, true);
  renderOrder();
}

function undo() {
  if (changeHistory.length === 0) return;
  var newMove = reverseChange(changeHistory.pop());
  sendMessage({cmd:"makeAMove", args:newMove});
  futureChanges.push(newMove);
}
function redo() {
  if (futureChanges.length === 0) return;
  var newMove = reverseChange(futureChanges.pop());
  sendMessage({cmd:"makeAMove", args:newMove});
  changeHistory.push(newMove);
}
function reverseChange(move) {
  var newMove = [myUser.id];
  var i = 0;
  move[i++]; // userId
  while (i < move.length) {
    var object = objectsById[move[i++]];
    var fromX         =      move[i++];
    var fromY         =      move[i++];
    var fromZ         =      move[i++];
    var fromFaceIndex =      move[i++];
    var   toX         =      move[i++];
    var   toY         =      move[i++];
    var   toZ         =      move[i++];
    var   toFaceIndex =      move[i++];
    object.x         = fromX;
    object.y         = fromY;
    object.z         = fromZ;
    object.faceIndex = fromFaceIndex;
    var newProps = selectedObjectIdToNewProps[object.id];
    if (newProps != null) {
      newProps.x         = object.x;
      newProps.y         = object.y;
      newProps.z         = object.z;
      newProps.faceIndex = object.faceIndex;
    }
    newMove.push(
      object.id,
      toX,
      toY,
      toZ,
      toFaceIndex,
      fromX,
      fromY,
      fromZ,
      fromFaceIndex);
    render(object, true);
  }
  renderOrder();

  return newMove;
}
function pushChangeToHistory(change) {
  changeHistory.push(change);
  futureChanges = [];
}

function eventToMouseX(event, div) { return event.clientX - div.getBoundingClientRect().left; }
function eventToMouseY(event, div) { return event.clientY - div.getBoundingClientRect().top; }

function renderUserList() {
  var userListUl = document.getElementById("userListUl");
  var userIds = Object.keys(usersById);
  userIds.sort();
  userListUl.innerHTML = userIds.map(function(userId) {
    return (
      '<li'+(userId === myUser.id ? ' id="myUserNameLi"' : '')+' title="Click to edit your name">' +
        sanitizeHtml(usersById[userId].userName) +
      '</li>');
  }).join("");

  document.getElementById("myUserNameLi").addEventListener("click", function() {
    var newName = prompt("New name (max length 16 characters):");
    if (!newName) return;
    sendMessage({
      cmd: "changeMyName",
      args: newName,
    });
    if (newName.length > 16) newName = newName.substring(0, 16);
    // anticipate
    myUser.userName = newName;
    renderUserList();
  });
}

function render(object, isAnimated) {
  if (object === examiningObject) return; // different handling for this
  var x = object.x;
  var y = object.y;
  var z = object.z;
  var faceIndex = object.faceIndex;
  var newProps = selectedObjectIdToNewProps[object.id];
  if (newProps != null) {
    x = newProps.x;
    y = newProps.y;
    z = newProps.z;
    faceIndex = newProps.faceIndex;
  }
  var objectDiv = getObjectDiv(object.id);
  var facePath = object.faces[faceIndex];
  var pixelX = tableDiv.offsetLeft + gameDefinition.coordinates.originX + gameDefinition.coordinates.unitWidth  * x;
  var pixelY = tableDiv.offsetTop  + gameDefinition.coordinates.originY + gameDefinition.coordinates.unitHeight * y;
  var pixelWidth = gameDefinition.coordinates.unitWidth * object.width;
  var pixelHeight = gameDefinition.coordinates.unitHeight * object.height;
  var imageUrlUrl = facePathToUrlUrl[facePath];
  if (isAnimated) {
    objectDiv.classList.add("animatedMovement");
  } else {
    objectDiv.classList.remove("animatedMovement");
  }
  objectDiv.style.left = pixelX + "px";
  objectDiv.style.top  = pixelY + "px";
  objectDiv.style.width  = pixelWidth;
  objectDiv.style.height = pixelHeight;
  objectDiv.style.zIndex = z;
  if (imageUrlUrl !== "" && objectDiv.dataset.facePath !== facePath) {
    objectDiv.dataset.facePath = facePath;
    objectDiv.style.backgroundImage = imageUrlUrl;
  }
  objectDiv.style.display = "block";
}
function renderExaminingObject() {
  var object = examiningObject;
  var windowWidth  = window.innerWidth;
  var windowHeight = window.innerHeight;
  var windowAspectRatio = windowWidth / windowHeight;
  var objectDiv = getObjectDiv(object.id);
  var objectAspectRatio = object.width / object.height;
  var bigWidth;
  var bigHeight;
  if (windowAspectRatio < objectAspectRatio) {
    bigWidth  = windowWidth;
    bigHeight = windowWidth  / objectAspectRatio;
  } else {
    bigWidth  = windowHeight * objectAspectRatio;
    bigHeight = windowHeight;
  }
  objectDiv.classList.add("animatedMovement");
  objectDiv.style.left = (windowWidth  - bigWidth)  / 2;
  objectDiv.style.top  = (windowHeight - bigHeight) / 2;
  objectDiv.style.width  = bigWidth;
  objectDiv.style.height = bigHeight;
  objectDiv.style.zIndex = findMaxZ() + 1;
  var stackHeightDiv = getStackHeightDiv(object.id);
  stackHeightDiv.style.display = "none";
}
function renderOrder() {
  var sizeAndLocationToIdAndZList = {};
  getObjects().forEach(function(object) {
    var newProps = selectedObjectIdToNewProps[object.id];
    if (newProps == null) newProps = object;
    var key = getStackId(newProps, object);
    var idAndZList = sizeAndLocationToIdAndZList[key];
    if (idAndZList == null) idAndZList = sizeAndLocationToIdAndZList[key] = [];
    idAndZList.push({id:object.id, z:newProps.z});
  });
  for (var key in sizeAndLocationToIdAndZList) {
    var idAndZList = sizeAndLocationToIdAndZList[key];
    idAndZList.sort(compareZ);
    idAndZList.forEach(function(idAndZ, i) {
      if (examiningObject != null && examiningObject.id === idAndZ.id) return;
      var stackHeightDiv = getStackHeightDiv(idAndZ.id);
      if (i > 0) {
        stackHeightDiv.textContent = (i + 1).toString();
        stackHeightDiv.style.display = "block";
      } else {
        stackHeightDiv.style.display = "none";
      }
    });
  }
}
function getStackId(newProps, object) {
  return [newProps.x, newProps.y, object.width, object.height].join(",");
}
function renderSelectionRectangle() {
  var selectionRectangleDiv = document.getElementById("selectionRectangleDiv");
  if (draggingMode === DRAG_RECTANGLE_SELECT) {
    var x = rectangleSelectStartX;
    var y = rectangleSelectStartY;
    var width  = rectangleSelectEndX - rectangleSelectStartX;
    var height = rectangleSelectEndY - rectangleSelectStartY;
    var borderWidth = parseInt(selectionRectangleDiv.style.borderWidth);
    if (width >= 0) {
      width -= 2 * borderWidth;
    } else {
      width *= -1;
      x -= width;
    }
    if (height >= 0) {
      height -= 2 * borderWidth;
    } else {
      height *= -1;
      y -= height;
    }
    if (height <= 0) height = 1;
    if (width  <= 0) width  = 1;
    selectionRectangleDiv.style.left = (tableDiv.offsetLeft + x) + "px";
    selectionRectangleDiv.style.top  = (tableDiv.offsetTop  + y) + "px";
    selectionRectangleDiv.style.width  = width  + "px";
    selectionRectangleDiv.style.height = height + "px";
    selectionRectangleDiv.style.display = "block";
  } else {
    selectionRectangleDiv.style.display = "none";
  }
}

function getObjects() {
  var objects = [];
  for (var objectId in objectsById) {
    objects.push(objectsById[objectId]);
  }
  return objects;
}
function getObjectsInZOrder() {
  var objects = [];
  objects.sort(compareZ);
  return objects;
}
function compareZ(a, b) {
  return operatorCompare(a.z, b.z);
}
function operatorCompare(a, b) {
  return a < b ? -1 : a > b ? 1 : 0;
}

function makeWebSocket() {
  var host = location.host;
  var pathname = location.pathname;
  var isHttps = location.protocol === "https:";
  var match = host.match(/^(.+):(\d+)$/);
  var defaultPort = isHttps ? 443 : 80;
  var port = match ? parseInt(match[2], 10) : defaultPort;
  var hostName = match ? match[1] : host;
  var wsProto = isHttps ? "wss:" : "ws:";
  var wsUrl = wsProto + "//" + hostName + ":" + port + pathname;
  return new WebSocket(wsUrl);
}

var socket;
var isConnected = false;
function connectToServer() {
  setScreenMode(SCREEN_MODE_WAITING_FOR_SERVER_CONNECT);

  socket = makeWebSocket();
  socket.addEventListener('open', onOpen, false);
  socket.addEventListener('message', onMessage, false);
  socket.addEventListener('error', timeoutThenCreateNew, false);
  socket.addEventListener('close', timeoutThenCreateNew, false);

  function onOpen() {
    isConnected = true;
    console.log("connected");
    var roomCodeToSend = roomCode;
    if (roomCode != null) {
      roomCodeToSend = roomCode;
      setScreenMode(SCREEN_MODE_WAITING_FOR_ROOM_CODE_CONFIRMATION);
    } else {
      roomCodeToSend = "new";
      setScreenMode(SCREEN_MODE_WAITING_FOR_CREATE_ROOM);
    }
    sendMessage({
      cmd: "joinRoom",
      args: {
        roomCode: roomCodeToSend,
      },
    });
  }
  function onMessage(event) {
    var msg = event.data;
    if (msg === "keepAlive") return;
    console.log(msg);
    var message = JSON.parse(msg);
    if (screenMode === SCREEN_MODE_WAITING_FOR_ROOM_CODE_CONFIRMATION && message.cmd === "badRoomCode") {
      // nice try
      disconnect();
      setScreenMode(SCREEN_MODE_LOGIN);
      // TODO: show message that says we tried
      return;
    }
    switch (screenMode) {
      case SCREEN_MODE_WAITING_FOR_CREATE_ROOM:
      case SCREEN_MODE_WAITING_FOR_ROOM_CODE_CONFIRMATION:
        if (message.cmd === "joinRoom") {
          setScreenMode(SCREEN_MODE_PLAY);
          roomCode = message.args.roomCode;
          myUser = {
            id: message.args.userId,
            userName: message.args.userName,
          };
          usersById[myUser.id] = myUser;
          message.args.users.forEach(function(otherUser) {
            usersById[otherUser.id] = otherUser;
          });
          initGame(message.args.game, message.args.history);
          renderUserList();
        } else throw asdf;
        break;
      case SCREEN_MODE_PLAY:
        if (message.cmd === "makeAMove") {
          makeAMove(message.args, true);
        } else if (message.cmd === "userJoined") {
          usersById[message.args.id] = {
            id: message.args.id,
            userName: message.args.userName,
          };
          renderUserList();
        } else if (message.cmd === "userLeft") {
          delete usersById[message.args.id];
          renderUserList();
        } else if (message.cmd === "changeMyName") {
          usersById[message.args.id].userName = message.args.userName;
          renderUserList();
        }
        break;
      default: throw asdf;
    }
  }
  function timeoutThenCreateNew() {
    removeListeners();
    if (isConnected) {
      isConnected = false;
      console.log("disconnected");
      deleteTableAndEverything();
      setScreenMode(SCREEN_MODE_DISCONNECTED);
    }
    setTimeout(connectToServer, 1000);
  }
  function disconnect() {
    console.log("disconnect");
    removeListeners();
    socket.close();
    isConnected = false;
  }
  function removeListeners() {
    socket.removeEventListener('open', onOpen, false);
    socket.removeEventListener('message', onMessage, false);
    socket.removeEventListener('error', timeoutThenCreateNew, false);
    socket.removeEventListener('close', timeoutThenCreateNew, false);
  }
}

function sendMessage(message) {
  socket.send(JSON.stringify(message));
}
function makeAMove(move, shouldRender) {
  var objectsToRender = shouldRender ? [] : null;
  var i = 0;
  var userId = move[i++];
  if (userId === myUser.id) return;
  while (i < move.length) {
    var object = objectsById[move[i++]];
    var fromX         =      move[i++];
    var fromY         =      move[i++];
    var fromZ         =      move[i++];
    var fromFaceIndex =      move[i++];
    var   toX         =      move[i++];
    var   toY         =      move[i++];
    var   toZ         =      move[i++];
    var   toFaceIndex =      move[i++];
    object.x = toX;
    object.y = toY;
    object.z = toZ;
    object.faceIndex = toFaceIndex;
    var newProps = selectedObjectIdToNewProps[object.id];
    if (newProps != null) {
      newProps.x = toX;
      newProps.y = toY;
      newProps.z = toZ;
      newProps.faceIndex = toFaceIndex;
    }
    if (shouldRender) objectsToRender.push(object);
  }

  if (shouldRender) {
    objectsToRender.forEach(function(object) {
      render(object, true);
    });
    renderOrder();
  }
  pushChangeToHistory(move);
}

function generateRandomId() {
  var result = "";
  for (var i = 0; i < 16; i++) {
    var n = Math.floor(Math.random() * 16);
    var c = n.toString(16);
    result += c;
  }
  return result;
}
function getObjectDiv(id) {
  return document.getElementById("object-" + id);
}
function getStackHeightDiv(id) {
  return document.getElementById("stackHeight-" + id);
}
function setDivVisible(div, visible) {
  div.style.display = visible ? "block" : "none";
}

function sanitizeHtml(text) {
  return text.replace(/&/g, "&amp;").replace(/</g, "&lt;");
}

setScreenMode(SCREEN_MODE_LOGIN);
