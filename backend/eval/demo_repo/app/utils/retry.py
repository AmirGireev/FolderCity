# A helper for repeating work.
import functools
import time


def with_retries(attempts=3, base_delay=0.5):
    def decorator(func):
        @functools.wraps(func)
        def wrapper(*args, **kwargs):
            for attempt in range(attempts):
                try:
                    return func(*args, **kwargs)
                except Exception:
                    if attempt == attempts - 1:
                        raise
                    time.sleep(base_delay * 2**attempt)

        return wrapper

    return decorator
