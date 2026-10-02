/**
 * Small program shown on first load so the workspace isn't empty. It shows
 * hats, variables, nested IF/ELSE and value blocks snapped together.
 * (Phase 4 replaces this with the template picker.)
 */
const num = (n: number) => ({ shadow: { type: "data_number", fields: { NUM: n } } });
const txt = (t: string) => ({ shadow: { type: "data_text", fields: { TEXT: t } } });
const clicks = { name: "clicks" };

export const STARTER_PROGRAM = {
  blocks: {
    languageVersion: 0,
    blocks: [
      {
        type: "events_button",
        x: 40,
        y: 40,
        fields: { LABEL: "Go" },
        next: {
          block: {
            type: "variables_change",
            fields: { VAR: clicks },
            inputs: { BY: num(1) },
            next: {
              block: {
                type: "control_if_else",
                inputs: {
                  CONDITION: {
                    block: {
                      type: "logic_compare",
                      fields: { OP: "gte" },
                      inputs: {
                        A: { ...txt(""), block: { type: "variables_get", fields: { VAR: clicks } } },
                        B: txt("3"),
                      },
                    },
                  },
                  THEN: {
                    block: {
                      type: "world_update_feed",
                      inputs: { MESSAGE: txt("Three clicks! Resetting.") },
                      next: {
                        block: { type: "variables_set", fields: { VAR: clicks }, inputs: { VALUE: txt("0") } },
                      },
                    },
                  },
                  ELSE: {
                    block: { type: "world_update_feed", inputs: { MESSAGE: txt("Click {clicks}") } },
                  },
                },
              },
            },
          },
        },
      },
    ],
  },
};
