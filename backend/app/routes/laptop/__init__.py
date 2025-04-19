# routes/laptop/__init__.py
from flask import Blueprint
from .core import core_bp
from .item import laptop_item_bp
from .sales import laptop_sales_bp

laptop_bp = Blueprint('laptop', __name__)

# Register sub-blueprints
laptop_bp.register_blueprint(core_bp)
laptop_bp.register_blueprint(laptop_item_bp, url_prefix='/item')
laptop_bp.register_blueprint(laptop_sales_bp, url_prefix='/sales')
