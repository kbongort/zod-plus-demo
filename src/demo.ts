import { send, SendType, ReceiveType, receive } from "./lib";

function demo() {
  try {
    const sendable: SendType = {
      foo: 2,
      things: ["blerg"],
      obj: { b: 1 },
      name: "penguin",
    };
    console.log("sendable:", sendable);

    const wire = send(sendable);
    console.log("wire:", wire);

    const received = receive(wire);
    console.log("received:", received);
  } catch (error) {
    console.log("error:", error);
  }
}

demo();
