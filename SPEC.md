# CIRCUIT — FULL FUNCTIONAL PROTOTYPE

Build a polished working prototype called **CIRCUIT**.

## CORE IDEA

CIRCUIT is a visual programming language for programmable crypto projects.

Think:

**Scratch / Blockly for coins.**

Instead of every developer separately coding:

creator fees → AI → browser  
volume → character → asset purchase  
trades → bounty → creator reward  
timer → API → website update

CIRCUIT gives creators generic programmable blocks which snap together.

Main tagline:

# Make your coin do something.

Secondary concept:

**Build behavior with blocks. Or describe what you want and let AI build it for you.**

IMPORTANT:

Do NOT hardcode project-specific blocks such as:

- Spawn Rat
- Wake LongCat
- Buy NVDA
- Add Nutty Item

Those are examples created USING generic blocks.

The primitives should instead be things such as:

- Create Agent
- Run Agent
- Set Variable
- Choose Random Item
- Call API
- Transfer Asset
- Update Website
- Generate Image
- Browse Web
- Create Bounty

The goal is maximum composability.

---

# AUTHORING MODEL

Use **Google Blockly** as the primary programming workspace.

This should feel closer to Scratch than a generic node graph.

Blocks should:

- snap together
- accept nested value blocks
- support nested conditions
- support branching
- support loops
- contain editable fields
- expose typed inputs/outputs where practical
- serialize to JSON
- deserialize back into the exact program

Do NOT use React Flow as the main programming interface.

React Flow may optionally be used for a separate read-only execution graph/visualizer, but Blockly is the source of truth.

---

# TWO WAYS TO BUILD

CIRCUIT must support two equally important creation modes.

## MODE 1 — BUILD WITH BLOCKS

User manually assembles logic.

Example:

WHEN
[ token volume increases ]

IF
[ accumulated volume ] >= [ 10 SOL ]

THEN

[ CREATE AGENT
  identity = AI generated
  type = random animal
  personality = random
]

[ CHOOSE RANDOM
  from = NVDA, TSLA, AAPL, META
  save as = selectedAsset
]

[ SIMULATE ASSET PURCHASE
  asset = selectedAsset
  amount = 0.03 SOL
]

[ UPDATE PROJECT WORLD
  add = createdAgent
]

This should actually execute.

## MODE 2 — BUILD WITH AI

At the top of the builder place a large prompt field:

**Describe what you want your project to do…**

Example user input:

“When every 10 SOL of volume is traded, create a new AI animal character, give it a random personality, let it randomly choose a stock, simulate buying 0.03 SOL of that stock, then add the new character and its stock to my website.”

Click:

**Build with AI**

The AI should convert the request into CIRCUIT blocks.

The resulting blocks physically appear inside the Blockly workspace.

The user can then:

- inspect them
- edit them
- delete blocks
- move blocks
- add conditions
- change values
- insert more behavior

AI does NOT hide the logic.

AI writes the visual program for the user.

This is a critical product feature.

---

# AI COMPILER ARCHITECTURE

Do not have the LLM generate arbitrary executable JavaScript.

Create an internal typed schema called:

**Circuit IR**

Example:

{
  "scripts": [
    {
      "event": {
        "type": "volume_changed",
        "config": {}
      },
      "body": [
        {
          "type": "accumulate",
          "variable": "volume",
          "value": "$event.amount"
        },
        {
          "type": "if",
          "condition": {
            "operator": ">=",
            "left": "$state.volume",
            "right": 10
          },
          "then": [
            {
              "type": "create_agent",
              "config": {
                "identityMode": "ai",
                "species": "random_animal"
              }
            }
          ]
        }
      ]
    }
  ]
}

Validate this with a strict schema such as Zod.

Pipeline:

USER DESCRIPTION
↓
LLM
↓
CIRCUIT IR
↓
VALIDATOR
↓
BLOCKLY WORKSPACE

Blockly should also compile back into the same IR.

This means manual building and AI building use exactly the same runtime.

If no AI API key exists, provide several deterministic demo prompts so the feature can still be demonstrated.

If an LLM API key is configured, allow actual natural-language compilation.

---

# BLOCK CATEGORIES

Design a large but coherent initial standard library.

## 1. EVENTS

These are Scratch-style hat blocks.

### When Trade Happens

Outputs:

- amount
- wallet
- side
- token
- timestamp

### When Volume Changes

Outputs:

- volume change
- total volume

### When Creator Fees Arrive

Outputs:

- amount
- wallet

### When Market Cap Crosses

Config:

- above/below
- threshold

### When Holder Count Crosses

### When Wallet Receives Funds

### When Token Graduates

### Every X Minutes

### At Time

### When Webhook Received

### When Website Event Happens

### When Agent Completes Task

### When Bounty Submission Arrives

### When Button Pressed

Useful for simulation/demo.

---

# 2. CONTROL

Scratch-style logic.

### IF

IF condition:
[ ]

DO:
[ ]

ELSE:
[ ]

### REPEAT N TIMES

### FOR EACH

### WAIT

### COOLDOWN

### STOP

### RUN IN PARALLEL

### RUN SEQUENCE

### RANDOM CHANCE

Example:

IF random chance [25%]

### SWITCH / CHOOSE BRANCH

---

# 3. CONDITIONS

Boolean blocks:

- equals
- not equals
- greater than
- less than
- greater/equal
- contains
- AND
- OR
- NOT
- exists
- wallet owns token
- variable comparison

These should snap into IF conditions.

---

# 4. MATH / DATA

- add
- subtract
- multiply
- divide
- percentage
- min
- max
- random number
- random item from list
- text
- number
- boolean
- list
- object
- current timestamp

---

# 5. VARIABLES & STATE

Scratch-style variables are essential.

Blocks:

SET [variable] TO [value]

CHANGE [variable] BY [value]

GET [variable]

APPEND [value] TO [list]

REMOVE FROM LIST

INCREMENT

RESET

State persists between executions.

Example project state:

totalVolume
agentsCreated
availableBudget
findings
portfolio
lastExecution

Show a live State Inspector.

---

# 6. AGENTS

This is generic.

## CREATE AGENT

Configuration:

Name:
- manual
- AI generated

Identity:
- custom
- AI generated

Visual:
- custom image URL
- emoji
- generated placeholder
- AI-generated later

Type/species:
- free text
- random from list
- AI generated

Personality:
- free text
- AI generated

Goal:
- free text

Model:
- configurable string

Memory:
- enabled/disabled

Initial variables:
- budget
- score
- inventory
- custom values

Output:

`agent`

Every created agent should become a persistent project entity with:

- unique ID
- name
- identity
- properties
- memory
- inventory
- createdAt
- activity history
- custom state

## RUN AGENT

Inputs:

- agent
- task
- available tools
- context

Outputs:

- response
- decision
- structured result

For prototype, support:
- mocked deterministic execution
- optional real LLM execution if API key configured

## GIVE AGENT TOOL

Examples:

browser
HTTP
image
project state

## UPDATE AGENT MEMORY

## GET AGENT PROPERTY

## SET AGENT PROPERTY

## REMOVE AGENT

Again:

There is NEVER a “rat” primitive.

A rat is simply:

CREATE AGENT
species = rat

A squirrel is:

CREATE AGENT
species = squirrel

A researcher is:

CREATE AGENT
role = researcher

---

# 7. AI

Generic AI operations independent of agents.

### ASK AI

prompt → text

### AI STRUCTURED OUTPUT

prompt + schema → object

### AI CHOOSE

options → selected option

### AI CLASSIFY

### AI SUMMARIZE

### AI GENERATE IDENTITY

### AI DECISION

These can use mocks without API keys.

---

# 8. WEB

### SEARCH WEB

Prototype may simulate unless search API configured.

### OPEN PAGE

### EXTRACT TEXT

### SAVE FINDING

### FOLLOW LINK

### HTTP REQUEST

For HTTP Request:

- GET
- POST
- PUT
- DELETE
- URL
- headers
- body

For public demo, prevent arbitrary unsafe requests or keep external execution disabled by default.

---

# 9. MEDIA

### GENERATE IMAGE

### GENERATE TEXT

### CREATE CARD

### CHOOSE IMAGE

### UPDATE AVATAR

Image generation may return attractive placeholders in demo mode.

---

# 10. PROJECT WORLD

This is important.

A Circuit project should be capable of maintaining a visible “world.”

Generic blocks:

### CREATE ENTITY

Not necessarily AI.

Fields:
- type
- name
- properties
- image

### UPDATE ENTITY

### DELETE ENTITY

### ADD TO COLLECTION

### UPDATE PROJECT FEED

### UPDATE COUNTER

### UPDATE WEBSITE STATE

### SHOW NOTIFICATION

This allows someone to build:

animals
employees
spaceships
collectibles
characters
items
teams

without CIRCUIT knowing what they represent.

---

# 11. FINANCE

ALL REAL FINANCIAL EXECUTION DISABLED IN PUBLIC PROTOTYPE.

Provide:

### GET WALLET BALANCE

Mock/live-read mode.

### SIMULATE TRANSFER

### SIMULATE BUY ASSET

Inputs:

asset
amount

### SIMULATE SELL ASSET

### ADD TO BUDGET

### SPEND FROM BUDGET

### CHECK BUDGET

### SPLIT BUDGET

Receipts must say:

SIMULATED

Architect adapters so these could later become real transaction modules.

Never expose private keys to client-side code.

---

# 12. BOUNTIES

### CREATE BOUNTY

Fields:
title
description
reward
deadline

### WAIT FOR SUBMISSION

### GET SUBMISSION

### AI REVIEW SUBMISSION

### APPROVE

### REJECT

### SIMULATE REWARD

Persist bounty state.

---

# 13. EXTERNAL OUTPUT

### SEND WEBHOOK

### POST MESSAGE

Destination:
- X
- Discord
- Telegram
- custom

Simulated by default.

### EMAIL / NOTIFICATION

Simulated.

---

# BIRTH-TIME CONFIGURATION

CIRCUIT must distinguish:

## PROJECT BIRTH CONFIG

from

## RUNTIME PROGRAM

Do not pretend creator-fee routing is something that can be changed by normal runtime blocks.

Create a project setup screen:

### Launch Mode

- Prototype only
- Existing Token
- Launch with Circuit

For Existing Token:

Allow:

- token address
- monitor trades
- monitor wallet
- monitor volume
- use separately funded execution budget

Display:

**Creator-fee routing depends on the token's existing configuration and is not automatically changed by Circuit.**

For Launch with Circuit:

Prototype UI can show:

Creator Fee Destination:
`Circuit Project Treasury`

This does NOT need to launch a real token yet.

It demonstrates the future architecture:

TOKEN
↓
PROJECT TREASURY
↓
CIRCUIT PROGRAM

---

# TREASURY

Every project may have a simulated treasury.

State:

SOL
USDC
custom budget buckets

Blocks can read budgets.

Example:

IF treasury.SOL > 1
DO ...

Allow named budgets:

computeBudget
rewardBudget
purchaseBudget

---

# LIVE SOLANA READ MODE

Optional but valuable.

Support configuration for:

- token mint
- wallet address

Architect a server-side adapter for Solana/Helius.

If Helius credentials exist:

allow live read-only webhook/event ingestion.

Useful real events:

- transfer
- swap
- wallet transaction

If credentials do not exist:

Demo Simulator generates identical normalized events.

The runtime must not care whether the event came from:

LIVE
or
SIMULATOR.

Everything becomes a normalized CIRCUIT event.

---

# EVENT NORMALIZATION

Example:

{
  "type": "token.trade",
  "source": "solana",
  "projectId": "...",
  "timestamp": 123,
  "data": {
    "amount": 10,
    "unit": "SOL"
  }
}

All adapters produce normalized events.

This is important for future extensibility.

---

# MODULE ARCHITECTURE

Every integration should conceptually be a Module.

Module may expose:

- events
- values
- actions

Example:

SOLANA MODULE

Events:
trade
transfer

Values:
walletBalance

Actions:
transfer

AI MODULE

Values/actions:
askAI
classify
generate

BROWSER MODULE

Actions:
search
openPage

WEBSITE MODULE

Actions:
createEntity
updateEntity
updateFeed

Create a basic `/modules` page showing installed modules.

---

# CUSTOM MODULE DEMO

Include a developer-oriented mock:

**Create Module**

Fields:

Name
Description

Add Event
Add Value
Add Action

Example:

Minecraft

Action:
spawnEntity

This doesn't need to dynamically execute arbitrary third-party code yet.

It demonstrates the future plugin architecture.

---

# PRIMARY DEMO

Do NOT make rats the default example.

Create a generic template called:

## LIVING CREW

Program:

WHEN
[ every 10 SOL volume ]

DO

CREATE AGENT
- species: random from
  cat
  frog
  penguin
  raccoon
  dog
  capybara

- name: AI generated
- personality: AI generated

SET selectedAsset TO
RANDOM ITEM FROM
[NVDA, TSLA, AAPL, META, AMD]

SIMULATE BUY ASSET
- asset = selectedAsset
- amount = 0.03 SOL

SET AGENT PROPERTY
- holdings = selectedAsset

ADD agent TO
- project world

UPDATE PROJECT FEED

Button:

**Simulate +10 SOL**

Result might be:

“Bongo the capybara was created.”

“Personality: reckless accountant.”

“Bongo selected META.”

“Simulated purchase: 0.03 SOL.”

A character card appears in the project world.

Next execution may create:

a frog
a cat
etc.

This demonstrates that behavior comes from generic primitives.

---

# SECOND TEMPLATE

## WEB EXPLORER

WHEN
creator fees arrive

CHANGE
computeBudget
BY
fee amount

IF
computeBudget >= threshold

RUN AGENT
task:
“Explore something strange on the web.”

BROWSE WEB

SAVE FINDING

UPDATE PROJECT FEED

---

# THIRD TEMPLATE

## AUTONOMOUS SHOPPER

WHEN
fees arrive

ADD TO
purchaseBudget

IF
purchaseBudget >= 20

RUN AGENT
task:
choose item

SIMULATE PURCHASE

CREATE ENTITY
type = purchased item

ADD TO COLLECTION
shelf

---

# FOURTH TEMPLATE

## CREATOR ENGINE

WHEN
volume crosses threshold

CREATE BOUNTY

WAIT FOR SUBMISSION

WHEN
submission received

AI REVIEW

IF
approved

SIMULATE REWARD

UPDATE FEED

---

# AI BUILD DEMOS

Provide clickable example prompts.

Example:

“Every 5 SOL of volume, create a random animal agent. Give it a funny AI-generated identity and add it to my website.”

“Whenever the treasury receives 0.1 SOL, wake an explorer agent and have it save a new web finding.”

“Every hour, randomly select one existing agent and have AI generate a diary entry.”

“When holder count reaches 1,000, generate a collectible and add it to the project gallery.”

“When someone submits work to a bounty, have AI score it. If the score is above 80, approve it.”

AI should turn each into editable blocks.

---

# EXECUTION

Add:

### RUN / SIMULATE

When an event is triggered:

highlight the relevant event block.

Then visually execute each statement.

Nested IF blocks visibly choose branches.

Variables visibly update.

Agent cards appear.

Receipts appear.

Use small delays so execution can be watched.

---

# DEBUGGER

Build a simple debugger.

Show:

Current block
Event payload
Variables
Agent state
Outputs
Execution stack

Buttons:

Run
Pause
Step
Stop

This makes CIRCUIT feel like a real programming environment.

---

# RECEIPTS

Every side effect generates a receipt.

Example:

EXECUTION #0042

Event:
Volume +10 SOL

CREATE_AGENT
ID: agent_17
Species: capybara
✓

AI_GENERATE_IDENTITY
Name: Bongo
✓

RANDOM_ITEM
META
✓

SIMULATED_BUY
0.03 SOL → META
✓

UPDATE_WORLD
agent_17 added
✓

Receipts are inspectable.

---

# PROJECT WORLD PREVIEW

Beside the builder have a configurable preview panel.

Tabs:

WORLD
FEED
STATE
AGENTS
TREASURY
EXECUTIONS

WORLD:

visual cards/entities created by program.

AGENTS:

all persistent agents.

STATE:

variables.

FEED:

project-generated activity.

This lets creators SEE the consequence of their code.

---

# SAVE / LOAD

Use Blockly JSON serialization.

Support:

Save project locally

Duplicate

Export `.circuit.json`

Import `.circuit.json`

Reset

Undo / redo

Autosave

---

# TECH STACK

Recommended:

Next.js
TypeScript
Tailwind
Google Blockly
Zustand
Zod
Framer Motion

Optional:

Postgres/Supabase later.

Prototype should work without database using localStorage or IndexedDB.

Server routes may be used for:

AI calls
webhooks
external integrations

---

# SECURITY MODEL

Do not execute arbitrary JavaScript generated by users or AI.

Use a controlled interpreter over Circuit IR.

Actions are explicitly registered adapters.

For prototype:

financial writes = simulated
social posting = simulated
shopping = simulated

AI calls = optional real
HTTP GET = optionally real
Solana reads = optionally real
timer = real
manual events = real
state = real
block execution = real

---

# ACCEPTANCE CRITERIA

The demo is complete when:

1. User can manually create programs with snap-together blocks.
2. IF/ELSE and nested logic genuinely execute.
3. Variables genuinely work.
4. Lists/random/math work.
5. Create Agent is generic and configurable.
6. Agents persist with properties/state.
7. User can trigger simulated events.
8. Workspace visibly executes block-by-block.
9. Project state changes based on the actual program.
10. AI can convert natural language into editable blocks.
11. Blocks can be edited after AI generation.
12. Programs save/load through JSON.
13. Four generic templates work.
14. Receipts/debug information work.
15. Project World reflects execution.
16. Existing-token mode does not pretend to control existing creator-fee routing.
17. No project-specific primitive such as Spawn Rat exists.
18. The architecture supports future modules without rewriting the language.

The finished prototype should make somebody think:

**“I can program an entire living coin without writing code.”**