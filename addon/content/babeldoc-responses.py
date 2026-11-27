"""Run the pinned BabelDOC CLI with an OpenAI Responses transport."""

from types import SimpleNamespace

import babeldoc.main as babeldoc_cli
from babeldoc.translator.translator import OpenAITranslator


class ResponsesTranslator(OpenAITranslator):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, **kwargs)
        self.client.chat.completions.create = self.create_response

    def create_response(
        self,
        *,
        model,
        messages,
        extra_body,
        extra_headers=None,
        max_tokens=None,
        response_format=None,
        temperature=None,
    ):
        options = {"model": model, "input": messages, "store": False}
        if reasoning := extra_body.get("reasoning"):
            options["reasoning"] = reasoning
        elif temperature is not None:
            options["temperature"] = temperature
        if max_tokens is not None:
            options["max_output_tokens"] = max_tokens
        if response_format is not None:
            options["text"] = {"format": response_format}

        response = self.client.responses.create(**options, extra_headers=extra_headers)
        output = getattr(response, "output_text", None)
        status = getattr(response, "status", None)
        if (
            status in {"failed", "incomplete", "cancelled"}
            or not isinstance(output, str)
            or not output.strip()
        ):
            reason = (
                getattr(getattr(response, "incomplete_details", None), "reason", None)
                or getattr(getattr(response, "error", None), "code", None)
                or status
                or "missing output text"
            )
            raise RuntimeError(f"Responses API did not return a complete translation ({reason})")

        usage = None
        if response.usage:
            usage = SimpleNamespace(
                total_tokens=getattr(response.usage, "total_tokens", 0),
                prompt_tokens=getattr(response.usage, "input_tokens", 0),
                completion_tokens=getattr(response.usage, "output_tokens", 0),
                prompt_cache_hit_tokens=getattr(
                    getattr(response.usage, "input_tokens_details", None),
                    "cached_tokens",
                    0,
                ),
            )
        return SimpleNamespace(
            choices=[SimpleNamespace(message=SimpleNamespace(content=output))],
            usage=usage,
        )


if __name__ == "__main__":
    babeldoc_cli.OpenAITranslator = ResponsesTranslator
    babeldoc_cli.cli()
