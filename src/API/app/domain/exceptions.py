class DomainError(Exception):
    """Base domain exception."""


class AuthenticationError(DomainError):
    """Raised when authentication fails."""


class AuthorizationError(DomainError):
    """Raised when a user cannot access a resource."""


class NotFoundError(DomainError):
    """Raised when an entity does not exist."""


class ValidationError(DomainError):
    """Raised when input data is invalid."""


class ResearchRateLimitError(DomainError):
    """A server-enforced research budget or in-flight reservation is active."""

    def __init__(self, retry_after: int):
        self.retry_after = max(1, retry_after)
        super().__init__(f"Price research is temporarily limited. Retry in {self.retry_after} seconds; saved data was preserved.")


class ResearchControlUnavailableError(DomainError):
    """Research cannot start until its shared usage control is available."""


class ResearchConflictError(DomainError):
    """The holding changed while external research was in progress."""
