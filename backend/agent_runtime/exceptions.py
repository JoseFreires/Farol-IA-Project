class RuntimeErrorFarol(Exception):
    pass


class MarkdownNotFoundError(RuntimeErrorFarol):
    pass


class MarkdownOutsideAllowedRootError(RuntimeErrorFarol):
    pass


class MarkdownInvalidFrontmatterError(RuntimeErrorFarol):
    pass


class MarkdownRequiredFieldMissingError(RuntimeErrorFarol):
    pass


class MarkdownNameMismatchError(RuntimeErrorFarol):
    pass


class MarkdownTooLargeError(RuntimeErrorFarol):
    pass


class MarkdownExecutorNotAllowedError(RuntimeErrorFarol):
    pass


class SkillNotFoundError(RuntimeErrorFarol):
    pass


class SkillDuplicateNameError(RuntimeErrorFarol):
    pass


class SkillInvalidDefinitionError(RuntimeErrorFarol):
    pass


class AgentNotFoundError(RuntimeErrorFarol):
    pass


class OllamaUnavailableError(RuntimeErrorFarol):
    pass


class OllamaTimeoutError(RuntimeErrorFarol):
    pass


class OllamaHttpError(RuntimeErrorFarol):
    pass


class OllamaInvalidResponseError(RuntimeErrorFarol):
    pass


class OllamaSchemaValidationError(RuntimeErrorFarol):
    pass
