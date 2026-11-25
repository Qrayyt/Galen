from dodaios.core.config import MarketplaceConfig
from dodaios.marketplace.glnt_client import catalog_base


def test_deployed_catalog_default_and_explicit_opt_out():
    assert catalog_base(MarketplaceConfig().glnt_catalog_url) == "https://galen.galenite.org/glnt"
    assert MarketplaceConfig(glnt_catalog_url="").glnt_catalog_url == ""
