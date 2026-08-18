/**
 * COUNTR Phase 3F
 *
 * VoiceCommandRouter regression/integration tests.
 *
 * These tests intentionally mock the lower layers so we can verify
 * the router's contract:
 *
 * Local executable command
 *     -> NEVER calls cloud
 *
 * Ambiguous command
 *     -> cloud
 *     -> GeminiCommandBridge
 *     -> only validated command can return remote_ai
 *
 * Offline
 *     -> NEVER calls cloud
 *
 * Gemini/backend failure
 *     -> safe local fallback
 *
 * Gemini validation failure
 *     -> NEVER passes an unvalidated remote command through
 */

import NetInfo from "@react-native-community/netinfo";
import AsyncStorage from "@react-native-async-storage/async-storage";

import {
  processLocalVoiceCommand,
  canExecuteLocalCommand,
} from "../src/core/ai/LocalCommandPipeline";

import {
  bridgeGeminiCommand,
} from "../src/core/ai/GeminiCommandBridge";

import {
  parseVoiceCommand,
} from "../src/core/ai/VoiceCommandRouter";


jest.mock(
  "@react-native-community/netinfo",
  () => ({
    fetch: jest.fn(),
  })
);

jest.mock(
  "@react-native-async-storage/async-storage",
  () => ({
    getItem: jest.fn(),
  })
);

jest.mock(
  "../src/config/api",
  () => ({
    BASE_URL: "http://test-server",
  })
);


// ------------------------------------------------------------
// We mock the local pipeline so this suite tests the router,
// not the already-tested Phase 3C implementation.
// ------------------------------------------------------------

jest.mock(
  "../src/core/ai/LocalCommandPipeline",
  () => ({
    processLocalVoiceCommand:
      jest.fn(),

    canExecuteLocalCommand:
      jest.fn(),
  })
);


// ------------------------------------------------------------
// We mock the Phase 3E-3 bridge so this suite verifies that
// VoiceCommandRouter actually sends cloud results through it.
// Phase 3E-3 has its own real bridge tests.
// ------------------------------------------------------------

jest.mock(
  "../src/core/ai/GeminiCommandBridge",
  () => ({
    bridgeGeminiCommand:
      jest.fn(),
  })
);


const mockFetch = jest.fn();


const makeNetworkOnline = () => {

  NetInfo.fetch.mockResolvedValue({
    isConnected: true,
    isInternetReachable: true,
  });
};


const makeNetworkOffline = () => {

  NetInfo.fetch.mockResolvedValue({
    isConnected: false,
    isInternetReachable: false,
  });
};


const makeLocalReady = ({
  intent = "sale.create",
  product = "Kurkure",
  quantity = 1,
  unit = "PCS",
  price_hint = 10,
  confidence = 1,
  customer_name = null,
  payment_type = null,
} = {}) => {

  const command = {
    intent,
    product,
    quantity,
    unit,
    price_hint,
    amount: null,
    customer_name,
    payment_type,
    confidence,
  };

  return {
    status: "READY",
    reason: null,
    command,
    source: "local_pipeline",
  };
};


const makeLocalBlocked = ({
  reason = "LOCAL_COMMAND_UNCERTAIN",
  confidence = 0,
} = {}) => {

  return {
    status: "PRODUCT_NOT_FOUND",
    reason,
    command: null,
    confidence,
    source: "local_pipeline",
  };
};


const makeRemoteResponse = body => {

  mockFetch.mockResolvedValue({
    ok: true,
    status: 200,
    json: jest.fn().mockResolvedValue(body),
  });
};


describe(
  "COUNTR Phase 3F - Voice Command Router",
  () => {

    beforeEach(() => {

      jest.clearAllMocks();

      global.fetch =
        mockFetch;

      AsyncStorage.getItem
        .mockResolvedValue(
          "test-token"
        );

      makeNetworkOnline();

      bridgeGeminiCommand
        .mockReturnValue({
          status: "READY",
          source: "GEMINI_VALIDATED",
          reason: null,
          command: {
            intent: "sale.create",
            product: "Parle G",
            quantity: 1,
            unit: "PCS",
            price_hint: 10,
            customer_name: null,
            payment_type: null,
            confidence: 1,
            resolved_inventory_id: "parle-10",
          },
        });

      processLocalVoiceCommand
        .mockReturnValue(
          makeLocalReady()
        );

      canExecuteLocalCommand
        .mockReturnValue(true);
    });


    test(
      "10 wala Kurkure stays completely local",
      async () => {

        const result =
          await parseVoiceCommand({
            text:
              "10 wala Kurkure",

            inventory: [
              {
                id: "kurkure-10",
                productName: "Kurkure",
                sellingPrice: 10,
                unit: "PCS",
              },
            ],

            customerNames: [],
          });


        expect(
          result.source
        ).toBe(
          "local_pipeline"
        );

        expect(
          result.execution
        ).toBe(
          "local"
        );

        expect(
          result.cloud_called
        ).toBe(false);

        expect(
          mockFetch
        ).not.toHaveBeenCalled();

        expect(
          bridgeGeminiCommand
        ).not.toHaveBeenCalled();
      }
    );


    test(
      "10 wala Parle Ji stays local and does not call Gemini",
      async () => {

        processLocalVoiceCommand
          .mockReturnValue(
            makeLocalReady({
              product: "Parle G",
              quantity: 1,
              price_hint: 10,
            })
          );


        const result =
          await parseVoiceCommand({
            text:
              "10 wala Parle Ji",

            inventory: [
              {
                id: "parle-10",
                productName: "Parle G",
                sellingPrice: 10,
                unit: "PCS",
              },
            ],
          });


        expect(
          result.source
        ).toBe(
          "local_pipeline"
        );

        expect(
          result.cloud_called
        ).toBe(false);

        expect(
          mockFetch
        ).not.toHaveBeenCalled();

        expect(
          bridgeGeminiCommand
        ).not.toHaveBeenCalled();
      }
    );


    test(
      "100 wale basmati chawal stays local",
      async () => {

        processLocalVoiceCommand
          .mockReturnValue(
            makeLocalReady({
              product: "Basmati Rice",
              quantity: 1,
              unit: "PCS",
              price_hint: 100,
            })
          );


        const result =
          await parseVoiceCommand({
            text:
              "100 wale basmati chawal",

            inventory: [
              {
                id: "basmati-100",
                productName: "Basmati Rice",
                sellingPrice: 100,
                unit: "PCS",
              },
            ],
          });


        expect(
          result.execution
        ).toBe(
          "local"
        );

        expect(
          result.cloud_called
        ).toBe(false);

        expect(
          mockFetch
        ).not.toHaveBeenCalled();
      }
    );


    test(
      "Rahul khata + 500 rupees stays local",
      async () => {

        processLocalVoiceCommand
          .mockReturnValue({
            status: "READY",
            command: {
              intent: "khata.credit",
              customer_name: "Rahul",
              amount: 500,
              quantity: null,
              product: null,
              confidence: 1,
            },
          });


        const result =
          await parseVoiceCommand({
            text:
              "Rahul ke khate mein paanch sau rupaye daalo",

            inventory: [],

            customerNames: [
              "Rahul",
            ],
          });


        expect(
          result.command.intent
        ).toBe(
          "khata.credit"
        );

        expect(
          result.command.amount
        ).toBe(500);

        expect(
          result.cloud_called
        ).toBe(false);

        expect(
          mockFetch
        ).not.toHaveBeenCalled();
      }
    );


    test(
      "Rahul + 2 kg sugar stays local",
      async () => {

        processLocalVoiceCommand
          .mockReturnValue(
            makeLocalReady({
              intent: "sale.create",
              product: "Sugar",
              quantity: 2,
              unit: "KG",
              price_hint: null,
              customer_name: "Rahul",
              payment_type: "KHATA",
            })
          );


        const result =
          await parseVoiceCommand({
            text:
              "Rahul ke khate mein 2 kg sugar",

            inventory: [
              {
                id: "sugar-kg",
                productName: "Sugar",
                sellingPrice: 60,
                unit: "KG",
              },
            ],

            customerNames: [
              "Rahul",
            ],
          });


        expect(
          result.source
        ).toBe(
          "local_pipeline"
        );

        expect(
          result.command.customer_name
        ).toBe(
          "Rahul"
        );

        expect(
          result.command.quantity
        ).toBe(2);

        expect(
          result.command.unit
        ).toBe("KG");

        expect(
          result.cloud_called
        ).toBe(false);

        expect(
          mockFetch
        ).not.toHaveBeenCalled();
      }
    );


    test(
      "truly ambiguous natural language can fall through to Gemini",
      async () => {

        processLocalVoiceCommand
          .mockReturnValue(
            makeLocalBlocked({
              confidence: 0.2,
            })
          );

        canExecuteLocalCommand
          .mockReturnValue(false);


        makeRemoteResponse({
          intent: "sale.create",
          product: "Parle Ji",
          quantity: null,
          unit: null,
          price_hint: 10,
          amount: null,
          customer_name: "Rahul",
          payment_type: "KHATA",
          confidence: 0.98,
          source: "GEMINI_AI",
        });


        const result =
          await parseVoiceCommand({
            text:
              "Rahul ko jo biscuit dena tha usme das wala parle ji laga do",

            inventory: [
              {
                id: "parle-10",
                productName: "Parle G",
                sellingPrice: 10,
                unit: "PCS",
              },
            ],

            customerNames: [
              "Rahul",
            ],
          });


        expect(
          mockFetch
        ).toHaveBeenCalledTimes(1);

        expect(
          bridgeGeminiCommand
        ).toHaveBeenCalledTimes(1);

        expect(
          bridgeGeminiCommand.mock.calls[0][0]
            .geminiResult.intent
        ).toBe(
          "sale.create"
        );

        expect(
          bridgeGeminiCommand.mock.calls[0][0]
            .inventory
        ).toHaveLength(1);

        expect(
          result.source
        ).toBe(
          "remote_ai"
        );

        expect(
          result.execution
        ).toBe(
          "remote"
        );

        expect(
          result.cloud_called
        ).toBe(true);

        expect(
          result.command.resolved_inventory_id
        ).toBe(
          "parle-10"
        );
      }
    );


    test(
      "router sends local understanding as local_hint to backend",
      async () => {

        processLocalVoiceCommand
          .mockReturnValue(
            makeLocalBlocked({
              confidence: 0.4,
            })
          );

        canExecuteLocalCommand
          .mockReturnValue(false);


        makeRemoteResponse({
          intent: "khata.credit",
          product: null,
          quantity: null,
          amount: 500,
          customer_name: "Rahul",
          confidence: 0.99,
        });


        await parseVoiceCommand({
          text:
            "Rahul ke account mein paise jama kar do",

          inventory: [],

          customerNames: [
            "Rahul",
          ],
        });


        const body =
          JSON.parse(
            mockFetch.mock.calls[0][1].body
          );


        expect(
          body.text
        ).toBe(
          "Rahul ke account mein paise jama kar do"
        );

        expect(
          body.voice_language
        ).toBe(
          "hi-en-hinglish"
        );

        expect(
          body.mode
        ).toBe(
          "command_parser"
        );

        expect(
          body.response_mode
        ).toBe(
          "strict_command_json"
        );

        expect(
          body.inventory_names
        ).toEqual([]);

        expect(
          body.customer_names
        ).toEqual([
          "Rahul",
        ]);

        expect(
          body.local_hint
        ).toBeDefined();

        expect(
          body.voice_features
            .indian_numbers
        ).toBe(true);

        expect(
          body.voice_features
            .price_variants
        ).toBe(true);
      }
    );


    test(
      "offline mode never calls Gemini",
      async () => {

        processLocalVoiceCommand
          .mockReturnValue(
            makeLocalBlocked({
              confidence: 0,
            })
          );

        canExecuteLocalCommand
          .mockReturnValue(false);

        makeNetworkOffline();


        const result =
          await parseVoiceCommand({
            text:
              "kuch aisa kar do jo mujhe samajh nahi aa raha",

            inventory: [],
          });


        expect(
          result.source
        ).toBe(
          "local_offline"
        );

        expect(
          result.execution
        ).toBe(
          "local"
        );

        expect(
          result.cloud_called
        ).toBe(false);

        expect(
          mockFetch
        ).not.toHaveBeenCalled();

        expect(
          bridgeGeminiCommand
        ).not.toHaveBeenCalled();
      }
    );


    test(
      "local priority remains authoritative even when cloud was reached",
      async () => {

        processLocalVoiceCommand
          .mockReturnValue({
            status: "READY",
            command: {
              intent: "sale.create",
              product: "Kurkure",
              quantity: 1,
              confidence: 0.86,
            },
          });

        canExecuteLocalCommand
          .mockReturnValue(true);


        makeRemoteResponse({
          intent: "inventory.add",
          product: "Kurkure",
          quantity: 50,
          confidence: 0.99,
        });


        const result =
          await parseVoiceCommand({
            text:
              "10 wala Kurkure",

            inventory: [
              {
                id: "kurkure-10",
                productName: "Kurkure",
                sellingPrice: 10,
                unit: "PCS",
              },
            ],
          });


        expect(
          mockFetch
        ).toHaveBeenCalledTimes(1);

        expect(
          result.source
        ).toBe(
          "local_priority"
        );

        expect(
          result.execution
        ).toBe(
          "local"
        );

        expect(
          result.command.intent
        ).toBe(
          "sale.create"
        );

        expect(
          result.remote_intent
        ).toBe(
          "inventory.add"
        );

        expect(
          bridgeGeminiCommand
        ).not.toHaveBeenCalled();
      }
    );


    test(
      "backend failure falls back safely to local result",
      async () => {

        processLocalVoiceCommand
          .mockReturnValue(
            makeLocalBlocked({
              confidence: 0.3,
            })
          );

        canExecuteLocalCommand
          .mockReturnValue(false);


        mockFetch.mockResolvedValue({
          ok: false,
          status: 500,
        });


        const result =
          await parseVoiceCommand({
            text:
              "some unknown command",

            inventory: [],
          });


        expect(
          result.source
        ).toBe(
          "local_backend_error"
        );

        expect(
          result.cloud_called
        ).toBe(true);

        expect(
          result.cloud_status
        ).toBe(500);

        expect(
          bridgeGeminiCommand
        ).not.toHaveBeenCalled();
      }
    );


    test(
      "invalid Gemini JSON falls back safely",
      async () => {

        processLocalVoiceCommand
          .mockReturnValue(
            makeLocalBlocked({
              confidence: 0.2,
            })
          );

        canExecuteLocalCommand
          .mockReturnValue(false);


        mockFetch.mockResolvedValue({
          ok: true,
          status: 200,
          json:
            jest.fn()
              .mockRejectedValue(
                new Error(
                  "Invalid JSON"
                )
              ),
        });


        const result =
          await parseVoiceCommand({
            text:
              "unknown command",

            inventory: [],
          });


        expect(
          result.source
        ).toBe(
          "local_invalid_remote"
        );

        expect(
          bridgeGeminiCommand
        ).not.toHaveBeenCalled();
      }
    );


    test(
      "Gemini command rejected by bridge never becomes remote_ai",
      async () => {

        processLocalVoiceCommand
          .mockReturnValue(
            makeLocalBlocked({
              confidence: 0.1,
            })
          );

        canExecuteLocalCommand
          .mockReturnValue(false);


        makeRemoteResponse({
          intent: "sale.create",
          product: "Colgate",
          quantity: 1,
          price_hint: 100,
          confidence: 0.99,
        });


        bridgeGeminiCommand
          .mockReturnValue({
            status:
              "PRODUCT_NOT_FOUND",

            reason:
              'No inventory product matches "Colgate".',

            command:
              null,
          });


        const result =
          await parseVoiceCommand({
            text:
              "100 wala Colgate",

            inventory: [
              {
                id: "parle-10",
                productName: "Parle G",
                sellingPrice: 10,
                unit: "PCS",
              },
            ],
          });


        expect(
          bridgeGeminiCommand
        ).toHaveBeenCalledTimes(1);

        expect(
          result.source
        ).toBe(
          "local_remote_rejected"
        );

        expect(
          result.execution
        ).toBe(
          "local"
        );

        expect(
          result.remote_validation_status
        ).toBe(
          "PRODUCT_NOT_FOUND"
        );

        expect(
          result.command
        ).toBeNull();

        expect(
          result.source
        ).not.toBe(
          "remote_ai"
        );
      }
    );


    test(
      "empty command is rejected without network call",
      async () => {

        const result =
          await parseVoiceCommand({
            text:
              "   ",
          });


        expect(
          result.status
        ).toBe(
          "INVALID_COMMAND"
        );

        expect(
          result.command
        ).toBeNull();

        expect(
          mockFetch
        ).not.toHaveBeenCalled();

        expect(
          bridgeGeminiCommand
        ).not.toHaveBeenCalled();
      }
    );


    test(
      "token is sent when available",
      async () => {

        processLocalVoiceCommand
          .mockReturnValue(
            makeLocalBlocked({
              confidence: 0.1,
            })
          );

        canExecuteLocalCommand
          .mockReturnValue(false);


        makeRemoteResponse({
          intent: "khata.credit",
          customer_name: "Rahul",
          amount: 500,
          confidence: 0.99,
        });


        await parseVoiceCommand({
          text:
            "Rahul ke account mein paanch sau jama karo",

          inventory: [],
        });


        expect(
          mockFetch.mock.calls[0][1]
            .headers.Authorization
        ).toBe(
          "Bearer test-token"
        );
      }
    );

  }
);
